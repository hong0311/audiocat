## AudioCat: Low-CPU Audio Stitching (No FFmpeg)

### Goals and constraints

- **Formats**: WAV and MP3 initially
- **Operations**: Concatenate multiple segments with optional fixed gaps (no crossfade)
- **No encoding/decoding**: Avoid CPU-heavy work; stream bytes as-is
- **Fail fast**: If core parameters don’t match, error out
- **Stream-first**: Support paths/URLs/streams/buffers; constant memory for long audio
- **Node**: 18+

### Philosophy

We only read minimal headers, validate compatibility, and then stream-copy container payloads. For WAV, we rewrite a single correct RIFF header. For MP3, we append frames, keeping the first segment’s ID3 and stripping others. Gaps are either zeroed PCM (WAV) or pre-encoded silence assets (MP3). No resampling, no normalization, no re-encoding.

---

## Lightweight detection packages (optional)

- **file-type** (`file-type`): Fast magic-bytes detector; can identify MP3 and WAV from small samples. CPU-cheap. Use to quickly recognize container type from a stream without reading whole files.
- We will implement tiny, focused parsers in-house for details we need (still very light CPU):
  - **WAV header parser**: Read RIFF/`fmt ` chunk → `numChannels`, `sampleRate`, `bitsPerSample`; locate `data` chunk offset/size. Skip unrelated chunks.
  - **MP3 header scanner**: Skip optional `ID3` (uses size field), find first MPEG frame sync, parse header bits → version, layer, bitrate, sample rate, channel mode, CBR/VBR hint via `Xing`/`Info`/`VBRI` if present.

Notes:

- Packages like `music-metadata` are feature-rich but larger; not required for our minimal needs. We keep dependencies lean and CPU usage minimal by default.

---

## Public API (library)

### Types

```ts
type AudioContainer = 'wav' | 'mp3';

type AudioSource =
  | Buffer
  | Uint8Array
  | string // file path or https:// URL
  | NodeJS.ReadableStream
  | AsyncIterable<Uint8Array>;

interface ProbeInfoBase {
  container: AudioContainer;
  sampleRate: number;
  channels: number;
}

interface WavProbeInfo extends ProbeInfoBase {
  container: 'wav';
  bitsPerSample: number; // 16/24/32 PCM
  dataBytes?: number; // if known from header
}

interface Mp3ProbeInfo extends ProbeInfoBase {
  container: 'mp3';
  bitrateKbps?: number; // first-frame derived (approx if VBR)
  vbr: boolean;
  id3v2Bytes?: number; // if present at head
}

type ProbeInfo = WavProbeInfo | Mp3ProbeInfo;

interface BaseStitchOptions {
  gapMs?: number; // default 0
  output: string | NodeJS.WritableStream | 'buffer';
  // strict validation is always on; extra flags can be added later if needed
}

interface StitchMp3Options extends BaseStitchOptions {
  // Provide or auto-pick pre-encoded silence assets matching parameters
  silence?: Buffer | Uint8Array | string; // path or bytes; if omitted uses built-ins when available
  keepFirstId3?: boolean; // default true
}

interface StitchWavOptions extends BaseStitchOptions {}
```

### Functions

```ts
// Read minimal header data only (few KB), no decoding
export async function probe(source: AudioSource): Promise<ProbeInfo>;

// WAV concatenation (same format required). Writes a single correct RIFF header.
export async function stitchWav(
  sources: AudioSource[],
  options: StitchWavOptions,
): Promise<Buffer | void>; // returns Buffer if output === 'buffer'

// MP3 concatenation (same core params required). Appends frames; optional pre-encoded silence between parts.
export async function stitchMp3(
  sources: AudioSource[],
  options: StitchMp3Options,
): Promise<Buffer | void>;
```

### Behaviors and validation

- All sources must be homogeneous per format:
  - WAV: `sampleRate`, `channels`, `bitsPerSample` must match
  - MP3: `sampleRate`, `channels` must match; bitrate/profile should match for ideal results; we fail if mismatched
- Gaps:
  - WAV: synthesized as zero-valued PCM written in small chunks
  - MP3: inserted as pre-encoded silence frames matching the detected parameters; if no matching asset and none provided, we fail
- Output targets:
  - `'buffer'`: accumulates to memory (use for short outputs)
  - file path: streamed with O(1) memory, seekable when needed (WAV header fix-up)
  - `WritableStream`: streamed; for WAV header, we either precompute length via pre-scan or restrict to seekable outputs

---

## Data flows (simplified)

### WAV stitching

```
sources[] ──► probe each (RIFF/PCM) ──► validate homogeneous
               │
               ├─► pre-scan to sum data sizes (read headers, locate data chunk sizes)
               │
               └─► open output
                      ├─ write provisional WAV header (or defer until sizes known)
                      ├─ for each source:
                      │     ├─ skip headers → stream-copy data chunk
                      │     └─ if gapMs>0 → write zero-PCM for gap
                      └─ finalize header with total data length (seek + rewrite)
```

### MP3 stitching

```
sources[] ──► probe first (ID3? first frame header) ──► validate homogeneous
               │
               └─► open output
                      ├─ copy first source:
                      │     ├─ keep ID3 (optional)
                      │     └─ append MPEG frames
                      ├─ for each next source:
                      │     ├─ skip ID3 if present
                      │     └─ append MPEG frames
                      └─ between sources (if gapMs>0):
                            └─ append pre-encoded silence asset of gap duration (repeat as needed)
```

---

## Error handling (fail fast)

- Unsupported container or unreadable headers → error
- Parameter mismatch across sources → error with clear message
- MP3 silence asset unavailable for requested parameters → error
- Non-seekable output for WAV when header finalization is required → error (unless pre-scan used)

---

## Performance & resource usage

- CPU: near-zero; header parsing and byte copying only
- Memory: configurable small chunk size (e.g., 64–256 KB) for streaming; `'buffer'` output accumulates by design
- I/O bound: dominant cost is disk/network read/write

---

## Built-in assets and utilities

- Pre-encoded MP3 silence catalog for common cases used by ElevenLabs/Gemini. Auto-selected by probe info. Users can supply custom silence when unsupported.
- Utility: small helpers to read/skip ID3v2, locate first MP3 frame sync, parse frame header.
- Utility: WAV `fmt ` and `data` chunk iterator; generator to stream zero-PCM for requested `gapMs`.

### MP3 silence formats we will bundle (initial)

- Container: MP3 (MPEG‑1 Layer III), CBR
- Sample rates: 44100 Hz, 48000 Hz
- Channels: mono, stereo
- Bitrates: 128 kbps, 192 kbps, 320 kbps

This covers ElevenLabs preset `mp3_44100_128` and common 48 kHz outputs. We can add more on demand (e.g., 192 kbps) if real-world inputs require it.

### Asset file layout

```
assets/
  silence/
    mp3/
      44100/
        mono/
          128k.mp3
          192k.mp3
          320k.mp3
        stereo/
          128k.mp3
          192k.mp3
          320k.mp3
      48000/
        mono/
          128k.mp3
          192k.mp3
          320k.mp3
        stereo/
          128k.mp3
          192k.mp3
          320k.mp3
```

Runtime lookup: `assets/silence/mp3/${sampleRate}/${channelMode}/${bitrate}.mp3`. Each file is a 0.1 s CBR MP3 silence clip. The library repeats whole-frame blocks to reach `gapMs` (nearest/floor/ceil policy). If a matching asset is missing, the library throws and suggests providing `options.silence`.

---

## CLI (later, optional)

- `audiocat probe <input>` → prints `ProbeInfo`
- `audiocat stitch --format wav|mp3 --gap 1000 <inputs...> -o output`

---

## Roadmap

1. MVP: `probe`, `stitchWav`, `stitchMp3` with strict validation and basic built-in MP3 silence assets
2. Enhanced MP3 seekability: optional Xing/Info header write (still no re-encode)
3. CLI wrapper
4. Expanded silence catalog or asset generation guidance

---

## FAQ

**Does file support increase CPU usage?** No. We stream bytes and avoid decoding; only small header reads and byte copies.

**Can we normalize loudness or crossfade?** Not without decoding → out of scope by design.

**How do we detect parameters?** Tiny in-house parsers (WAV/MP3) plus optional `file-type` for quick container identification.

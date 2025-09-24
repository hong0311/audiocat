# AudioCat

[![npm version](https://img.shields.io/npm/v/audiocat.svg)](https://www.npmjs.com/package/audiocat)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Low-CPU audio stitching for Node.js. Concatenate WAV or MP3 segments (optionally with fixed gaps) without decoding or re-encoding. No ffmpeg required.

- WAV: stream-copy PCM, write a single correct RIFF header, synthesize silence as zeroed PCM
- MP3: stream-append frames, optional pre-encoded silence assets for gaps
- Strict fail-fast validation: all segments must share core parameters
- Stream-first design; constant memory; Node 18+

## Install

```bash
npm install audiocat
```

## Quick start

```ts
import { stitch, probe } from 'audiocat';

// Two (or more) segments as Buffers or file paths
const parts = [Buffer.from(/* ... */), '/path/to/segment2.mp3'];

// Write to a file with a 1s gap between parts
await stitch(parts, { gapMs: 1000, output: { type: 'file', path: './output.mp3' } });

// Or get the result in-memory
const buf = await stitch(parts, { gapMs: 0, output: { type: 'buffer' } });

// Probe metadata
const info = await probe(parts[0]);
// → { container: 'mp3', sampleRate: 44100, channels: 2, bitrateKbps?: number, vbr: boolean }
```

## API

### Types

- `AudioSource`: `Buffer | Uint8Array | string` (file path)
- `OutputTarget`: `{ type: 'buffer' } | { type: 'file', path: string }`

### Functions

- `probe(source: AudioSource): Promise<ProbeInfo>`
  - Uses `music-metadata` to read core parameters
  - Returns:
    - WAV: `{ container: 'wav', sampleRate, channels, bitsPerSample }`
    - MP3: `{ container: 'mp3', sampleRate, channels, bitrateKbps?, vbr }`

- `stitch(sources: AudioSource[], options: StitchOptions): Promise<Buffer | void>`
  - Convenience wrapper: probes first source and dispatches to WAV/MP3 stitchers

- `stitchWav(sources: AudioSource[], options: StitchWavOptions): Promise<Buffer | void>`
  - Requirements: all inputs share `sampleRate`, `channels`, `bitsPerSample`
  - Gap handling: writes zero-valued PCM bytes for `gapMs`

- `stitchMp3(sources: AudioSource[], options: StitchMp3Options): Promise<Buffer | void>`
  - Requirements: all inputs share `sampleRate`, `channels`, and (ideally) bitrate/profile
  - Gap handling: inserts pre-encoded CBR silence assets (see Assets)
  - Options:
    - `gapMs?: number` (default 0)
    - `output: OutputTarget`
    - `silence?: Buffer | Uint8Array | string` (override built-in silence)
    - `keepFirstId3?: boolean` (default true)
    - `gapRounding?: 'nearest' | 'floor' | 'ceil'` (frame-quantized)

## Assets (MP3 silence)

MP3 gaps are implemented by appending pre-encoded CBR silence frames. The library bundles short 0.1s assets and repeats them to achieve the requested `gapMs`.

- Path (relative to library): `assets/silence/mp3/<sampleRate>/<mono|stereo>/<bitrate>.mp3`
- Bundled presets: 44100 and 48000 Hz; mono/stereo; 128k, 192k, 320k
- If a matching asset is missing, pass `silence` in options or change your encoder output to a supported preset.

WAV gaps are synthesized (zero PCM), so no assets are required.

## Design notes

- No decoding/re-encoding; CPU usage stays minimal
- Streaming I/O in small chunks (64KB) for constant memory
- Strict validation; fail fast on parameter mismatch
- Probing: `music-metadata` for robust header parsing

## Examples (TTS scripts)

See `src/scripts/` for minimal Gemini and ElevenLabs examples (not published to npm). Build first, then run:

```bash
npm run build
node dist/scripts/sample-gemini.js
node dist/scripts/sample-elevenlabs.js
```

Set the required environment variables as described in `src/scripts/README.md`.

## Limitations

- No resampling, normalization, trimming, or crossfade
- MP3 gapless playback is not guaranteed (frame-quantized gaps)
- Inputs must be homogeneous per format (sample rate/channels/bits or bitrate)

## Development

```bash
# Install deps
npm install

# Lint & typecheck
npm run lint && npm run typecheck

# Build
npm run build

# Test
npm test
```

## License

MIT © Contributors

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSource, closeSource, readBytes } from './io.js';
import type { AudioSource, StitchMp3Options, Mp3ProbeInfo } from './types.js';
import { probe } from './probe.js';

function skipId3Size(buf: Buffer): number {
  if (buf.length < 10) return 0;
  if (buf.toString('ascii', 0, 3) !== 'ID3') return 0;
  const b6 = buf.readUInt8(6);
  const b7 = buf.readUInt8(7);
  const b8 = buf.readUInt8(8);
  const b9 = buf.readUInt8(9);
  const size = ((b6 & 0x7f) << 21) | ((b7 & 0x7f) << 14) | ((b8 & 0x7f) << 7) | (b9 & 0x7f);
  return 10 + size;
}

function findFirstFrameOffset(buf: Buffer, start: number): number {
  for (let i = start; i + 4 <= buf.length; i++) {
    const b1 = buf.readUInt8(i);
    const b2 = buf.readUInt8(i + 1);
    if (b1 === 0xff && (b2 & 0xe0) === 0xe0) return i;
  }
  return -1;
}

function estimateFrameDurationMs(info: Mp3ProbeInfo): number {
  // MPEG-1 Layer III: 1152 samples per frame
  const samplesPerFrame = 1152;
  return (samplesPerFrame / info.sampleRate) * 1000;
}

function loadSilenceAsset(info: Mp3ProbeInfo, opts: StitchMp3Options): Buffer {
  if (opts.silence) {
    return Buffer.isBuffer(opts.silence) ? opts.silence : fs.readFileSync(String(opts.silence));
  }
  const channelMode: 'mono' | 'stereo' = info.channels === 1 ? 'mono' : 'stereo';
  const bitrateNum = info.bitrateKbps ?? 128;
  const bitrate = `${bitrateNum}k`;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const assetPath = path.resolve(
    here,
    `../assets/silence/mp3/${info.sampleRate}/${channelMode}/${bitrate}.mp3`,
  );
  if (!fs.existsSync(assetPath)) {
    throw new Error(
      `Silence asset not found for ${info.sampleRate} Hz, ${channelMode}, ${bitrate}. Provide options.silence or add asset.`,
    );
  }
  return fs.readFileSync(assetPath);
}

export async function stitchMp3(
  sources: AudioSource[],
  options: StitchMp3Options & { output: { type: 'buffer' } },
): Promise<Buffer>;
export async function stitchMp3(
  sources: AudioSource[],
  options: StitchMp3Options & { output: { type: 'file'; path: string } },
): Promise<void>;
export async function stitchMp3(
  sources: AudioSource[],
  options: StitchMp3Options,
): Promise<Buffer | void> {
  if (!sources.length) throw new Error('No sources provided');
  const first = await probe(sources[0]!);
  if (first.container !== 'mp3') throw new Error('stitchMp3 requires MP3 inputs');
  const firstInfo = first;

  // Validate
  for (let i = 1; i < sources.length; i++) {
    const src = sources[i]!;
    const info = await probe(src);
    if (info.container !== 'mp3') throw new Error('All inputs must be MP3');
    if (info.sampleRate !== firstInfo.sampleRate || info.channels !== firstInfo.channels) {
      throw new Error('MP3 parameter mismatch across sources');
    }
    if (info.bitrateKbps !== firstInfo.bitrateKbps) {
      throw new Error('MP3 bitrate mismatch across sources');
    }
  }

  const opened = sources.map((s) => openSource(s));
  const keepFirstId3 = options.keepFirstId3 ?? true;
  const gapMs = options.gapMs ?? 0;
  const gapRounding = options.gapRounding ?? 'nearest';

  try {
    const parts: Buffer[] = [];
    for (let i = 0; i < opened.length; i++) {
      const cur = opened[i]!;
      const head = readBytes(cur, 0, 8192);
      const id3 = skipId3Size(head);
      const frameOff = findFirstFrameOffset(head, id3);
      if (frameOff < 0) throw new Error('MP3 frame sync not found');
      const chunk = readBytes(
        cur,
        keepFirstId3 && i === 0 ? 0 : frameOff,
        cur.size - (keepFirstId3 && i === 0 ? 0 : frameOff),
      );
      parts.push(chunk);
      if (i < opened.length - 1 && gapMs > 0) {
        const silence = loadSilenceAsset(firstInfo, options);
        const frameDurMs = estimateFrameDurationMs(firstInfo);
        const framesExact = gapMs / frameDurMs;
        let frames: number;
        if (gapRounding === 'floor') frames = Math.floor(framesExact);
        else if (gapRounding === 'ceil') frames = Math.ceil(framesExact);
        else frames = Math.round(framesExact);
        frames = Math.max(frames, 0);
        if (frames > 0) {
          // Append the 0.1s asset multiple times until covering frames
          // Since we don't parse per-frame within the asset here, we append the asset enough times
          // to exceed or meet the requested frames and accept minor rounding already accounted for.
          const repeats = Math.max(1, Math.ceil((frames * frameDurMs) / 100)); // asset is 0.1s
          for (let r = 0; r < repeats; r++) parts.push(silence);
        }
      }
    }

    if (options.output.type === 'buffer') {
      return Buffer.concat(parts);
    }
    const outPath = options.output.type === 'file' ? options.output.path : undefined;
    if (!outPath) throw new Error('MP3 file output path required');
    const fd = fs.openSync(outPath, 'w');
    try {
      for (const p of parts) fs.writeSync(fd, p);
    } finally {
      fs.closeSync(fd);
    }
  } finally {
    opened.forEach(closeSource);
  }
}

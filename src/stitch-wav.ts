import fs from 'node:fs';
import { openSource, closeSource, readBytes, writeBufferToFile } from './io.js';
import type { AudioSource, StitchWavOptions, WavProbeInfo } from './types.js';
import { probe } from './probe.js';

function createWavHeader(totalDataBytes: number, info: WavProbeInfo): Buffer {
  const { channels, sampleRate, bitsPerSample } = info;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + totalDataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(totalDataBytes, 40);
  return buffer;
}

export async function stitchWav(
  sources: AudioSource[],
  options: StitchWavOptions,
): Promise<Buffer | void> {
  if (!sources.length) throw new Error('No sources provided');
  const firstInfo = await probe(sources[0]!);
  if (firstInfo.container !== 'wav') throw new Error('stitchWav requires WAV inputs');

  // Validate and collect sizes
  const opened = sources.map((s) => openSource(s));
  try {
    const infos: WavProbeInfo[] = [];
    for (const src of sources) {
      const info = await probe(src);
      if (info.container !== 'wav') throw new Error('All inputs must be WAV');
      if (
        info.sampleRate !== firstInfo.sampleRate ||
        info.channels !== firstInfo.channels ||
        info.bitsPerSample !== firstInfo.bitsPerSample
      ) {
        throw new Error('WAV parameter mismatch across sources');
      }
      infos.push(info);
    }

    const gapMs = options.gapMs ?? 0;
    const bytesPerSample = firstInfo.bitsPerSample / 8;
    const bytesPerMs = Math.floor(
      (firstInfo.sampleRate * firstInfo.channels * bytesPerSample) / 1000,
    );

    // Find data offset/size per source by scanning header of each
    const parts: { opened: ReturnType<typeof openSource>; start: number; length: number }[] = [];
    let totalData = 0;
    for (let i = 0; i < opened.length; i++) {
      const cur = opened[i]!;
      const head = readBytes(cur, 0, 8192);
      // locate 'data' chunk
      let offset = 12;
      let dataStart = -1;
      let dataSize = 0;
      while (offset + 8 <= head.length) {
        const id = head.toString('ascii', offset, offset + 4);
        const size = head.readUInt32LE(offset + 4);
        if (id === 'data') {
          dataStart = offset + 8;
          dataSize = size;
          break;
        }
        offset += 8 + size;
      }
      if (dataStart < 0) throw new Error('WAV data chunk not found');
      parts.push({ opened: cur, start: dataStart, length: dataSize });
      totalData += dataSize;
      if (i < opened.length - 1 && gapMs > 0) {
        totalData += bytesPerMs * gapMs;
      }
    }

    const header = createWavHeader(totalData, firstInfo);

    if (options.output.type === 'buffer') {
      const bufs: Buffer[] = [header];
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        bufs.push(readBytes(part.opened, part.start, part.length));
        if (i < parts.length - 1 && gapMs > 0) {
          const gap = Buffer.alloc(bytesPerMs * gapMs, 0);
          bufs.push(gap);
        }
      }
      return Buffer.concat(bufs);
    }

    // file path output
    const outPath = options.output.type === 'file' ? options.output.path : undefined;
    if (!outPath) throw new Error('WAV file output path required');
    writeBufferToFile(outPath, header);
    const fd = fs.openSync(outPath, 'a');
    try {
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        let remaining = part.length;
        let position = part.start;
        const chunkSize = 64 * 1024;
        while (remaining > 0) {
          const toRead = Math.min(chunkSize, remaining);
          const chunk = readBytes(part.opened, position, toRead);
          fs.writeSync(fd, chunk);
          position += chunk.length;
          remaining -= chunk.length;
        }
        if (i < parts.length - 1 && gapMs > 0) {
          const zeroChunk = Buffer.alloc(64 * 1024, 0);
          let gapBytes = bytesPerMs * gapMs;
          while (gapBytes > 0) {
            const n = Math.min(zeroChunk.length, gapBytes);
            fs.writeSync(fd, zeroChunk, 0, n);
            gapBytes -= n;
          }
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  } finally {
    opened.forEach(closeSource);
  }
}

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stitchWav, probe } from './index.js';
import { discoverFixtures } from './test-helpers/fixtures.js';

function makeWav({
  seconds,
  sampleRate,
  channels,
}: {
  seconds: number;
  sampleRate: number;
  channels: number;
}): Buffer {
  const frames = Math.max(1, Math.floor(seconds * sampleRate));
  const dataBytes = frames * channels * 2; // 16-bit
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);
  const pcm = Buffer.alloc(dataBytes, 0);
  return Buffer.concat([header, pcm]);
}

describe('stitchWav()', (): void => {
  it('concatenates 2 segments with 0 gap (buffer output)', async (): Promise<void> => {
    const a = makeWav({ seconds: 0.05, sampleRate: 44100, channels: 1 });
    const b = makeWav({ seconds: 0.05, sampleRate: 44100, channels: 1 });
    const out = await stitchWav([a, b], { gapMs: 0, output: { type: 'buffer' } });
    expect(Buffer.isBuffer(out)).toBe(true);
    const buf = out as Buffer;
    const info = await probe(buf);
    expect(info.container).toBe('wav');
    if (info.container === 'wav') {
      expect(info.sampleRate).toBe(44100);
      expect(info.channels).toBe(1);
      expect(info.bitsPerSample).toBe(16);
    }
    // size = header(44) + dataA + dataB
    const dataBytes = a.length - 44 + (b.length - 44);
    expect(buf.length).toBe(44 + dataBytes);
  });

  it('concatenates with 100ms gap (file output)', async (): Promise<void> => {
    const a = makeWav({ seconds: 0.02, sampleRate: 48000, channels: 2 });
    const b = makeWav({ seconds: 0.02, sampleRate: 48000, channels: 2 });
    const p = path.join(process.cwd(), 'tmp_stitch_wav.wav');
    await stitchWav([a, b], { gapMs: 100, output: { type: 'file', path: p } });
    try {
      const buf = fs.readFileSync(p);
      const info = await probe(buf);
      expect(info.container).toBe('wav');
      if (info.container === 'wav') {
        expect(info.sampleRate).toBe(48000);
        expect(info.channels).toBe(2);
      }
      const bytesPerMs = Math.floor((48000 * 2 * 2) / 1000);
      const expected = 44 + (a.length - 44) + (b.length - 44) + bytesPerMs * 100;
      expect(buf.length).toBe(expected);
    } finally {
      fs.unlinkSync(p);
    }
  });

  it('fails on parameter mismatch', async (): Promise<void> => {
    const a = makeWav({ seconds: 0.01, sampleRate: 44100, channels: 1 });
    const b = makeWav({ seconds: 0.01, sampleRate: 48000, channels: 1 });
    await expect(() => stitchWav([a, b], { output: { type: 'buffer' } })).rejects.toThrow();
  });

  it('matches bitwise concatenation of data chunks (no gap)', async (): Promise<void> => {
    const set = discoverFixtures();
    if (set.wavParts.length < 2) return; // skip if not provided
    const aPath = set.wavParts[0]!;
    const bPath = set.wavParts[1]!;
    const a = fs.readFileSync(aPath);
    const b = fs.readFileSync(bPath);
    // strip headers
    const aData = a.subarray(44);
    const bData = b.subarray(44);
    const expectedData = Buffer.concat([aData, bData]);
    const out = await stitchWav([a, b], { gapMs: 0, output: { type: 'buffer' } });
    const buf = out as Buffer;
    const outData = buf.subarray(44);
    expect(outData.equals(expectedData)).toBe(true);
  });

  it('matches provided wav_concat exactly when stitching parts (gap 2000ms)', async (): Promise<void> => {
    const set = discoverFixtures();
    if (!set.wavExpected || set.wavParts.length < 2) return;
    const parts = set.wavParts.map((p) => fs.readFileSync(p));
    const expected = fs.readFileSync(set.wavExpected);
    const out = await stitchWav(parts, { gapMs: 2000, output: { type: 'buffer' } });
    expect((out as Buffer).equals(expected)).toBe(true);
  });
});

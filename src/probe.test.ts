import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { probe } from './index.js';

function makeWavPcm16({
  seconds = 0.05,
  sampleRate = 44100,
  channels = 1,
}: {
  seconds?: number;
  sampleRate?: number;
  channels?: number;
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

describe('probe()', (): void => {
  it('detects WAV from Buffer', async (): Promise<void> => {
    const buf = makeWavPcm16({ seconds: 0.01, sampleRate: 44100, channels: 2 });
    const info = await probe(buf);
    expect(info.container).toBe('wav');
    if (info.container === 'wav') {
      expect(info.sampleRate).toBe(44100);
      expect(info.channels).toBe(2);
      expect(info.bitsPerSample).toBe(16);
    }
  });

  it('detects WAV from file path', async (): Promise<void> => {
    const buf = makeWavPcm16({ seconds: 0.02, sampleRate: 48000, channels: 1 });
    const p = path.join(process.cwd(), 'tmp_probe_wav.wav');
    fs.writeFileSync(p, buf);
    try {
      const info = await probe(p);
      expect(info.container).toBe('wav');
      if (info.container === 'wav') {
        expect(info.sampleRate).toBe(48000);
        expect(info.channels).toBe(1);
        expect(info.bitsPerSample).toBe(16);
      }
    } finally {
      fs.unlinkSync(p);
    }
  });

  it('throws on unsupported data', async (): Promise<void> => {
    await expect(() => probe(Buffer.from('not audio'))).rejects.toThrow();
  });
});

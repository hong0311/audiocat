import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stitchMp3, probe } from './index.js';
import { discoverFixtures, skipId3Size } from './test-helpers/fixtures.js';

// Minimal MP3 fixture note:
// For unit tests without external deps, we can store a tiny CBR MP3 in test fixtures.
// As a placeholder, skip tests if fixture is missing.

const FIX = path.join(process.cwd(), 'assets/silence/mp3/44100/mono/128k.mp3');

describe('stitchMp3()', () => {
  it('concatenates 2 segments with 0 gap (buffer output)', async () => {
    if (!fs.existsSync(FIX)) return;
    const a = fs.readFileSync(FIX);
    const b = fs.readFileSync(FIX);
    const out = await stitchMp3([a, b], { gapMs: 0, output: { type: 'buffer' } });
    expect(Buffer.isBuffer(out)).toBe(true);
    const buf = out as Buffer;
    const info = await probe(buf);
    expect(info.container).toBe('mp3');
  });

  it('concatenates with 100ms gap (file output)', async () => {
    if (!fs.existsSync(FIX)) return;
    const a = fs.readFileSync(FIX);
    const b = fs.readFileSync(FIX);
    const p = path.join(process.cwd(), 'tmp_stitch_mp3.mp3');
    await stitchMp3([a, b], { gapMs: 100, output: { type: 'file', path: p } });
    try {
      const buf = fs.readFileSync(p);
      const info = await probe(buf);
      expect(info.container).toBe('mp3');
    } finally {
      fs.unlinkSync(p);
    }
  });

  it('bitwise equality for pure append (no gap, same inputs)', async () => {
    const set = discoverFixtures();
    if (set.mp3Parts.length < 2) return; // skip if not provided
    const aPath = set.mp3Parts[0]!;
    const bPath = set.mp3Parts[1]!;
    const a = fs.readFileSync(aPath);
    const b = fs.readFileSync(bPath);
    // Expected byte sequence: first file (all bytes) + second with ID3 stripped
    const id3 = skipId3Size(b);
    const bFrames = b.subarray(id3);
    const expected = Buffer.concat([a, bFrames]);
    const out = await stitchMp3([a, b], { gapMs: 0, output: { type: 'buffer' } });
    const buf = out as Buffer;
    expect(buf.equals(expected)).toBe(true);
  });

  it('matches provided mp3_concat exactly when stitching parts (gap 2000ms)', async () => {
    const set = discoverFixtures();
    if (!set.mp3Expected || set.mp3Parts.length < 2) return;
    const parts = set.mp3Parts.map((p) => fs.readFileSync(p));
    const expected = fs.readFileSync(set.mp3Expected);
    const out = await stitchMp3(parts, { gapMs: 2000, output: { type: 'buffer' } });
    expect((out as Buffer).equals(expected)).toBe(true);
  });
});

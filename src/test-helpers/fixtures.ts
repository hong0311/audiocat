import fs from 'node:fs';
import path from 'node:path';

export interface FixtureDiscovery {
  mp3Parts: string[];
  mp3Expected: string | undefined;
  wavParts: string[];
  wavExpected: string | undefined;
}

function list(dir: string, pattern: RegExp): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => pattern.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => path.join(dir, f));
}

export function discoverFixtures(): FixtureDiscovery {
  const cwd = process.cwd();
  const fxBase = path.join(cwd, 'src', '__fixtures__');
  const mp3Dir = path.join(fxBase, 'mp3');
  const wavDir = path.join(fxBase, 'wav');

  // Prefer structured fixtures under src/__fixtures__
  const mp3Parts = list(mp3Dir, /^mp3_part_\d+\.mp3$/i);
  const wavParts = list(wavDir, /^wav_part_\d+\.wav$/i);
  const mp3Expected = fs.existsSync(path.join(mp3Dir, 'mp3_concat.mp3'))
    ? path.join(mp3Dir, 'mp3_concat.mp3')
    : undefined;
  const wavExpected = fs.existsSync(path.join(wavDir, 'wav_concat.wav'))
    ? path.join(wavDir, 'wav_concat.wav')
    : undefined;

  return { mp3Parts, mp3Expected, wavParts, wavExpected };
}

export function skipId3Size(buf: Buffer): number {
  if (buf.length < 10) return 0;
  if (buf.toString('ascii', 0, 3) !== 'ID3') return 0;
  const b6 = buf.readUInt8(6);
  const b7 = buf.readUInt8(7);
  const b8 = buf.readUInt8(8);
  const b9 = buf.readUInt8(9);
  const size = ((b6 & 0x7f) << 21) | ((b7 & 0x7f) << 14) | ((b8 & 0x7f) << 7) | (b9 & 0x7f);
  return 10 + size;
}

import type { AudioSource, StitchMp3Options } from './types.js';
import { probe } from './probe.js';
import { stitchMp3 } from './stitch-mp3.js';
import { stitchWav } from './stitch-wav.js';

export type StitchOptions = StitchMp3Options; // superset of WAV options

export async function stitch(
  sources: AudioSource[],
  options: StitchOptions & { output: { type: 'buffer' } },
): Promise<Buffer>;
export async function stitch(
  sources: AudioSource[],
  options: StitchOptions & { output: { type: 'file'; path: string } },
): Promise<void>;
export async function stitch(
  sources: AudioSource[],
  options: StitchOptions,
): Promise<Buffer | void> {
  if (!sources.length) throw new Error('No sources provided');
  const info = await probe(sources[0]!);
  if (info.container === 'mp3') {
    return stitchMp3(sources, options as never);
  }
  if (info.container === 'wav') {
    return stitchWav(sources, options as never);
  }
  throw new Error('Unsupported container');
}

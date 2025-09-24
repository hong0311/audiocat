/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
// To run this script:
// npm i @elevenlabs/elevenlabs-js
// Set ELEVENLABS_API_KEY in env (client reads it by default)

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import fs from 'node:fs';
import path from 'node:path';
import type { ReadableStream } from 'node:stream/web';

// Use built library exports
import { probe, stitchMp3, stitchWav } from '../../dist/index.js';

const prompts: string[] = [
  'Hello, this is part one.',
  'And this is part two.',
  'And this is part three.',
];

const elevenlabs = new ElevenLabsClient();

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return buffer;
}

async function main(): Promise<void> {
  console.log('Starting ElevenLabs audio generation...');
  const voiceId = process.env['ELEVENLABS_VOICE_ID'];
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID is not set');
  const segmentBuffers: Buffer[] = [];

  const seed = process.env['ELEVENLABS_SEED']
    ? Number(process.env['ELEVENLABS_SEED'])
    : Math.floor(Math.random() * 4294967295);
  console.log('Using seed:', seed);

  for (let i = 0; i < prompts.length; i++) {
    const raw = prompts[i];
    if (!raw) continue;
    const text = raw.trim();
    if (!text) continue;

    console.log(`Processing segment ${i + 1}/${prompts.length}...`);
    console.log(`Text: "${text.substring(0, 50)}..."`);

    const audio = await elevenlabs.textToSpeech.convert(voiceId, {
      text,
      modelId: process.env['ELEVENLABS_MODEL_ID'] ?? 'eleven_v3',
      outputFormat: process.env['ELEVENLABS_OUTPUT'] ?? 'mp3_44100_128',
      languageCode: process.env['ELEVENLABS_LANG'] ?? 'en',
      seed,
    });

    const u8 = await readAll(audio);
    const buf = Buffer.from(u8);
    segmentBuffers.push(buf);

    const partPath = path.join(process.cwd(), `eleven_part_${String(i + 1).padStart(2, '0')}.mp3`);
    fs.writeFileSync(partPath, buf);
    console.log(`✅ Segment ${i + 1} saved to ${partPath} (${buf.length} bytes)`);
  }

  if (segmentBuffers.length === 0) {
    throw new Error('No segments generated');
  }
  console.log('All segments generated. Probing first segment...');
  const info = await probe(segmentBuffers[0]!);

  const outDir = process.cwd();
  if (info.container === 'mp3') {
    const output = { type: 'file' as const, path: path.join(outDir, 'eleven_concat.mp3') };
    console.log('Stitching MP3 with 1.5s gap...');
    await stitchMp3(segmentBuffers, { gapMs: 1500, output });
    console.log('🎧 Concatenated MP3 saved to', output.path);
  } else if (info.container === 'wav') {
    const output = { type: 'file' as const, path: path.join(outDir, 'eleven_concat.wav') };
    console.log('Stitching WAV with 1.5s gap...');
    await stitchWav(segmentBuffers, { gapMs: 1500, output });
    console.log('🎧 Concatenated WAV saved to', output.path);
  } else {
    throw new Error('Unsupported container from ElevenLabs');
  }

  console.log('Audio generation process finished.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

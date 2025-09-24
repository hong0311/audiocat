/* eslint-disable @typescript-eslint/no-floating-promises */
// To run this code you need to install the following dependencies:
// npm install @google/genai mime
// npm install -D @types/node

import { GoogleGenAI } from '@google/genai';
import mime from 'mime';
import { writeFile } from 'fs';
import path from 'node:path';
import { probe, stitchMp3, stitchWav } from '../../dist/index.js';

function saveBinaryFile(fileName: string, content: Buffer): void {
  writeFile(fileName, content, (err) => {
    if (err) {
      console.error(`Error writing file ${fileName}:`, err);
      return;
    }
    console.log(`File ${fileName} saved to file system.`);
  });
}

async function main(): Promise<void> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env['GEMINI_TTS_MODEL'];
  const voiceName = process.env['GEMINI_VOICE'];
  if (!model) throw new Error('GEMINI_TTS_MODEL is not set');
  if (!voiceName) throw new Error('GEMINI_VOICE is not set');
  const config = {
    temperature: 1,
    responseModalities: ['audio'],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
  };

  console.log('Generating two short audio segments...');
  const seg1 = await generateOneAudio(ai, model, config, 'Hello, this is part one.');
  const seg2 = await generateOneAudio(ai, model, config, 'And this is part two.');
  const altVoice = process.env['GEMINI_VOICE_ALT'] ?? voiceName;
  const seg3 = await generateOneAudio(
    ai,
    model,
    {
      ...config,
      speechConfig: {
        ...config.speechConfig,
        voiceConfig: { prebuiltVoiceConfig: { voiceName: altVoice } },
      },
    },
    'And this is part three.',
  );

  const outDir = process.cwd();
  saveBinaryFile(path.join(outDir, `gemini_part_1.${seg1.suggestedExt}`), seg1.buffer);
  saveBinaryFile(path.join(outDir, `gemini_part_2.${seg2.suggestedExt}`), seg2.buffer);
  saveBinaryFile(path.join(outDir, `gemini_part_3.${seg3.suggestedExt}`), seg3.buffer);

  const info = await probe(seg1.buffer);
  if (info.container === 'mp3') {
    const output = { type: 'file' as const, path: path.join(outDir, 'gemini_concat.mp3') };
    console.log('Stitching MP3 with 1s gap...');
    await stitchMp3([seg1.buffer, seg2.buffer, seg3.buffer], { gapMs: 2000, output });
    console.log('Saved:', output.path);
  } else if (info.container === 'wav') {
    const output = { type: 'file' as const, path: path.join(outDir, 'gemini_concat.wav') };
    console.log('Stitching WAV with 1s gap...');
    await stitchWav([seg1.buffer, seg2.buffer, seg3.buffer], { gapMs: 2000, output });
    console.log('Saved:', output.path);
  } else {
    throw new Error('Unsupported container from Gemini');
  }
}

main();

async function generateOneAudio(
  ai: GoogleGenAI,
  model: string,
  config: unknown,
  text: string,
): Promise<{ buffer: Buffer; suggestedExt: string }> {
  const response = await ai.models.generateContentStream({
    model,
    config: config as never,
    contents: [{ role: 'user', parts: [{ text }] }],
  });
  for await (const chunk of response) {
    const inline = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inline) continue;
    const ext = mime.getExtension(inline.mimeType ?? '') ?? '';
    if (!ext) {
      const wav = convertToWav(inline.data ?? '', inline.mimeType ?? '');
      return { buffer: wav, suggestedExt: 'wav' };
    }
    const buffer = Buffer.from(inline.data ?? '', 'base64');
    return { buffer, suggestedExt: ext };
  }
  throw new Error('No inline audio received from Gemini');
}

interface WavConversionOptions {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

function convertToWav(rawData: string, mimeType: string): Buffer {
  const options = parseMimeType(mimeType);
  const buffer = Buffer.from(rawData, 'base64');
  const wavHeader = createWavHeader(buffer.length, options);
  return Buffer.concat([wavHeader, buffer]);
}

function parseMimeType(mimeType: string): WavConversionOptions {
  const [fileType, ...params] = mimeType.split(';').map((s) => s.trim());
  const [, format] = (fileType ?? '').split('/');

  const options: Partial<WavConversionOptions> = {
    numChannels: 1,
  };

  if (format?.startsWith('L')) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) {
      options.bitsPerSample = bits;
    }
  }

  for (const param of params) {
    const [key, value] = (param?.split('=') ?? []).map((s) => s.trim());
    if (key === 'rate' && value) options.sampleRate = parseInt(value, 10);
  }

  return options as WavConversionOptions;
}

function createWavHeader(dataLength: number, options: WavConversionOptions): Buffer {
  const { numChannels, sampleRate, bitsPerSample } = options;

  // http://soundfile.sapp.org/doc/WaveFormat

  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0); // ChunkID
  buffer.writeUInt32LE(36 + dataLength, 4); // ChunkSize
  buffer.write('WAVE', 8); // Format
  buffer.write('fmt ', 12); // Subchunk1ID
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22); // NumChannels
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(byteRate, 28); // ByteRate
  buffer.writeUInt16LE(blockAlign, 32); // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34); // BitsPerSample
  buffer.write('data', 36); // Subchunk2ID
  buffer.writeUInt32LE(dataLength, 40); // Subchunk2Size

  return buffer;
}

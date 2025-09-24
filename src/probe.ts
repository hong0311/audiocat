import { openSource, closeSource, readBytes } from './io.js';
import type { AudioSource, Mp3ProbeInfo, ProbeInfo, WavProbeInfo } from './types.js';

function parseWavHeader(buf: Buffer): WavProbeInfo | null {
  if (buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  // Walk chunks to find fmt and data
  let offset = 12;
  let fmtFound = false;
  let dataBytes: number | undefined;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const next = offset + 8 + size;
    if (id === 'fmt ') {
      fmtFound = true;
      const audioFormat = buf.readUInt16LE(offset + 8);
      channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      bitsPerSample = buf.readUInt16LE(offset + 22);
      if (audioFormat !== 1) {
        // Only PCM supported in MVP
        return null;
      }
    } else if (id === 'data') {
      dataBytes = size;
    }
    offset = next;
  }
  if (!fmtFound || !sampleRate || !channels || !bitsPerSample) return null;
  const base: WavProbeInfo = {
    container: 'wav',
    sampleRate,
    channels,
    bitsPerSample,
  } as WavProbeInfo;
  return typeof dataBytes === 'number' ? ({ ...base, dataBytes } as WavProbeInfo) : base;
}

function skipId3Size(buf: Buffer): number {
  // ID3v2 header is 10 bytes: 'ID3' + ver + flags + 4-byte synchsafe size
  if (buf.length < 10) return 0;
  if (buf.toString('ascii', 0, 3) !== 'ID3') return 0;
  const b6 = buf.readUInt8(6);
  const b7 = buf.readUInt8(7);
  const b8 = buf.readUInt8(8);
  const b9 = buf.readUInt8(9);
  const size = ((b6 & 0x7f) << 21) | ((b7 & 0x7f) << 14) | ((b8 & 0x7f) << 7) | (b9 & 0x7f);
  return 10 + size;
}

function parseMp3Header(buf: Buffer, start: number): Mp3ProbeInfo | null {
  const maxScan = Math.min(buf.length, start + 4096);
  for (let i = start; i + 4 <= maxScan; i++) {
    const b1 = buf.readUInt8(i);
    const b2 = buf.readUInt8(i + 1);
    if (b1 === 0xff && (b2 & 0xe0) === 0xe0) {
      const versionBits = (b2 >> 3) & 0x03;
      const layerBits = (b2 >> 1) & 0x03;
      if (layerBits !== 0x01) continue; // Layer III only
      const b3 = buf.readUInt8(i + 2);
      const bitrateIndex = (b3 >> 4) & 0x0f;
      const sampleRateIndex = (b3 >> 2) & 0x03;
      if (bitrateIndex === 0x0f || sampleRateIndex === 0x03) continue;
      const b4 = buf.readUInt8(i + 3);
      const channelMode = (b4 >> 6) & 0x03; // 3=mono, else stereo variants
      const sampleRates = versionBits === 0x03 ? [44100, 48000, 32000] : [22050, 24000, 16000];
      const sampleRate = sampleRates[sampleRateIndex];
      const channels = channelMode === 0x03 ? 1 : 2;
      const bitrateTable: Record<number, number> = {
        0x01: 32,
        0x02: 40,
        0x03: 48,
        0x04: 56,
        0x05: 64,
        0x06: 80,
        0x07: 96,
        0x08: 112,
        0x09: 128,
        0x0a: 160,
        0x0b: 192,
        0x0c: 224,
        0x0d: 256,
        0x0e: 320,
      };
      const bitrateKbps = bitrateTable[bitrateIndex];
      return {
        container: 'mp3',
        sampleRate,
        channels,
        bitrateKbps,
        vbr: false,
        id3v2Bytes: start,
      } as Mp3ProbeInfo;
    }
  }
  return null;
}

export function probe(source: AudioSource): Promise<ProbeInfo> {
  const opened = openSource(source);
  try {
    const head = readBytes(opened, 0, 8192);
    const wav = parseWavHeader(head);
    if (wav) return Promise.resolve(wav);
    const id3 = skipId3Size(head);
    const mp3 = parseMp3Header(head, id3);
    if (mp3) return Promise.resolve(mp3);
    return Promise.reject(new Error('Unsupported or unrecognized audio container'));
  } finally {
    closeSource(opened);
  }
}

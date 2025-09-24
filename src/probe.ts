import { openSource, closeSource, readBytes } from './io.js';
import type { AudioSource, ProbeInfo } from './types.js';
import { parseBuffer, parseFile, type IAudioMetadata } from 'music-metadata';

export async function probe(source: AudioSource): Promise<ProbeInfo> {
  const opened = openSource(source);
  try {
    let metadata: IAudioMetadata;
    if (opened.kind === 'file' && opened.filePath) {
      metadata = await parseFile(opened.filePath, { duration: false });
    } else if (opened.kind === 'buffer' && opened.buffer) {
      metadata = await parseBuffer(opened.buffer, undefined, { duration: false });
    } else {
      const head = readBytes(opened, 0, Math.min(opened.size, 8192));
      metadata = await parseBuffer(head, undefined, { duration: false });
    }

    const container = (metadata.format.container ?? metadata.format.codec ?? '').toLowerCase();
    const sampleRate = metadata.format.sampleRate ?? 0;
    const channels = metadata.format.numberOfChannels ?? 0;
    if (!sampleRate || !channels) throw new Error('Could not read core audio parameters');

    if (container.includes('wav') || container.includes('wave') || container.includes('riff')) {
      const bitsPerSample = metadata.format.bitsPerSample ?? 16;
      return { container: 'wav', sampleRate, channels, bitsPerSample } as ProbeInfo;
    }
    if (container.includes('mp3') || container.includes('mpeg')) {
      const bitrateKbps = metadata.format.bitrate
        ? Math.round(metadata.format.bitrate / 1000)
        : undefined;
      const vbr = Boolean(metadata.format.codecProfile?.toLowerCase().includes('vbr'));
      return { container: 'mp3', sampleRate, channels, bitrateKbps, vbr } as ProbeInfo;
    }

    throw new Error(`Unsupported container: ${container || 'unknown'}`);
  } finally {
    closeSource(opened);
  }
}

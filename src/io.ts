import fs from 'node:fs';
import path from 'node:path';

import type { AudioSource } from './types.js';

export interface OpenedSource {
  kind: 'buffer' | 'file';
  size: number;
  buffer?: Buffer;
  fd?: number;
  filePath?: string;
}

export function isPathLike(input: string): boolean {
  return input.startsWith('/') || input.startsWith('./') || input.startsWith('../');
}

export function openSource(source: AudioSource): OpenedSource {
  if (typeof source === 'string') {
    const filePath = path.resolve(source);
    const stat = fs.statSync(filePath);
    return {
      kind: 'file',
      size: stat.size,
      fd: fs.openSync(filePath, 'r'),
      filePath,
    };
  }
  const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source);
  return {
    kind: 'buffer',
    size: buffer.byteLength,
    buffer,
  };
}

export function closeSource(opened: OpenedSource): void {
  if (opened.kind === 'file' && opened.fd != null) {
    try {
      fs.closeSync(opened.fd);
    } catch {
      /* noop */
    }
  }
}

export function readBytes(opened: OpenedSource, offset: number, length: number): Buffer {
  if (opened.kind === 'buffer' && opened.buffer) {
    return opened.buffer.subarray(offset, offset + length);
  }
  if (opened.kind === 'file' && opened.fd != null) {
    const out = Buffer.alloc(length);
    const bytes = fs.readSync(opened.fd, out, 0, length, offset);
    return out.subarray(0, bytes);
  }
  throw new Error('Invalid opened source');
}

export function streamCopyToFile(
  sources: { opened: OpenedSource; start: number; length: number }[],
  outputPath: string,
): number {
  const fd = fs.openSync(outputPath, 'w');
  let written = 0;
  try {
    for (const part of sources) {
      let remaining = part.length;
      let position = part.start;
      const chunkSize = 64 * 1024;
      while (remaining > 0) {
        const toRead = Math.min(chunkSize, remaining);
        const chunk = readBytes(part.opened, position, toRead);
        fs.writeSync(fd, chunk);
        position += chunk.length;
        remaining -= chunk.length;
        written += chunk.length;
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return written;
}

export function writeBufferToFile(outputPath: string, buffer: Buffer): void {
  fs.writeFileSync(outputPath, buffer);
}

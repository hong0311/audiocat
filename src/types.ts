export type AudioContainer = 'wav' | 'mp3';

export type AudioSource = Buffer | Uint8Array | string; // path or bytes (MVP)

export interface ProbeInfoBase {
  container: AudioContainer;
  sampleRate: number;
  channels: number;
}

export interface WavProbeInfo extends ProbeInfoBase {
  container: 'wav';
  bitsPerSample: number;
  dataBytes?: number;
}

export interface Mp3ProbeInfo extends ProbeInfoBase {
  container: 'mp3';
  bitrateKbps?: number;
  vbr: boolean;
  id3v2Bytes?: number;
}

export type ProbeInfo = WavProbeInfo | Mp3ProbeInfo;

export type OutputTarget = { type: 'buffer' } | { type: 'file'; path: string };

export interface BaseStitchOptions {
  gapMs?: number;
  output: OutputTarget;
}

export interface StitchMp3Options extends BaseStitchOptions {
  silence?: Buffer | Uint8Array | string;
  keepFirstId3?: boolean;
  gapRounding?: 'nearest' | 'floor' | 'ceil';
}

export type StitchWavOptions = BaseStitchOptions;

export interface InternalWavFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

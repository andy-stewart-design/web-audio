export interface RenderSettings {
  sampleRate: number;
  channels: number;
  beatsPerBar: number;
  startOffsetFrames: number;
}

// Diagnostic provenance only; not an environment/version compatibility gate.
export interface RecordingMetadata {
  id: string;
  settings: RenderSettings;
  bars: number;
  tailSeconds: number;
  bpm: number;
  frameCount: number;
  browserVersion: string;
}

export interface SketchCase {
  id: string;
  description: string;
  code: string;
  bars: number;
  tailSeconds: number;
  expectSilence?: boolean;
  settings?: Partial<RenderSettings>;
  // Exact normalized sample URL -> local file (package-relative or absolute).
  resources?: Record<string, string>;
}

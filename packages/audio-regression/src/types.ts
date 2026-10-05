export interface RenderSettings {
  sampleRate: number;
  channels: number;
  beatsPerBar: number;
  startOffsetFrames: number;
}

export interface SketchCase {
  id: string;
  description: string;
  code: string;
  bars: number;
  tailSeconds: number;
  expectSilence?: boolean;
  settings?: Partial<RenderSettings>;
}

export type Metronome = { beat: number; bar: number };
export type ClockEventType =
  | "start"
  | "pause"
  | "stop"
  | "prebeat"
  | "prebar"
  | "beat"
  | "bar";
export type ClockEventCallback = (m: Metronome, time: number) => void;

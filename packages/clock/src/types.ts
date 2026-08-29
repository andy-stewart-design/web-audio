export type Metronome = { beat: number; bar: number };
export type ClockEventType =
  | "start"
  | "stop"
  | "prebeat"
  | "prebar"
  | "beat"
  | "bar";
export type ClockEventCallback = (
  metronome: Metronome,
  time: number,
  barDuration: number,
) => void;

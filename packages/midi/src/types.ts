interface Signal<T> {
  readonly value: T;
  subscribe(fn: (value: T) => void): () => void;
}

type MidiStatus =
  | "pending"
  | "connected"
  | "denied"
  | "unavailable"
  | "error"
  | "destroyed";

type MidiDevice = {
  id: string;
  name: string | null;
};

type MidiNote = {
  note: number;
  velocity: number;
  deviceId: string;
  channel: number;
};

interface CcSignal extends Signal<number> {
  readonly raw: number;
  readonly hasValue: boolean;
  readonly deviceId: string | null;
  readonly receivedChannel: number | null;
  channel(channel: number): CcSignal;
}

interface NoteSignal extends Signal<ReadonlySet<MidiNote>> {
  channel(channel: number): NoteSignal;
}

export type { CcSignal, MidiDevice, MidiNote, MidiStatus, NoteSignal, Signal };

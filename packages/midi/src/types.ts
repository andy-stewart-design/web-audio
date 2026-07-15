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

interface MidiInputs {
  cc(cc: number): CcSignal;
  cc(selector: string, cc: number): CcSignal;
  notes(selector?: string): NoteSignal;
}

// Internal browser-adapter contracts. These intentionally model only the Web
// MIDI surface used by this package and are not exported from the public entry.
interface WebMidiPort {
  readonly id: string;
  readonly name: string | null;
  readonly state: "connected" | "disconnected";
}

interface WebMidiMessageEvent extends Event {
  readonly data: Uint8Array;
}

interface WebMidiInput extends WebMidiPort {
  addEventListener(
    type: "midimessage",
    listener: (event: WebMidiMessageEvent) => void,
  ): void;
  removeEventListener(
    type: "midimessage",
    listener: (event: WebMidiMessageEvent) => void,
  ): void;
}

type WebMidiOutput = WebMidiPort;

interface WebMidiPortMap<T extends WebMidiPort> {
  values(): IterableIterator<T>;
}

interface WebMidiAccess {
  readonly inputs: WebMidiPortMap<WebMidiInput>;
  readonly outputs: WebMidiPortMap<WebMidiOutput>;
  onstatechange: ((event: Event) => void) | null;
}

export type {
  CcSignal,
  MidiDevice,
  MidiInputs,
  MidiNote,
  MidiStatus,
  NoteSignal,
  Signal,
  WebMidiAccess,
  WebMidiInput,
  WebMidiMessageEvent,
  WebMidiOutput,
};

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

interface ResolvedMidiOutput {
  readonly id: string;
}

type MidiSendResult =
  | { sent: true }
  | { sent: false; reason: "unavailable" | "destroyed" | "send-error" };

type MidiNoteOnOptions = {
  note: number;
  velocity?: number;
  channel?: number;
  time?: number;
};

type MidiNoteOffOptions = {
  note: number;
  channel?: number;
  time?: number;
};

type MidiCcOptions = {
  cc: number;
  value: number;
  channel?: number;
  time?: number;
};

type MidiAllNotesOffOptions = {
  channel?: number;
  time?: number;
};

interface MidiOutputs {
  resolve(selector?: string): ResolvedMidiOutput | null;
  noteOn(
    target: string | ResolvedMidiOutput,
    options: MidiNoteOnOptions,
  ): MidiSendResult;
  noteOff(
    target: string | ResolvedMidiOutput,
    options: MidiNoteOffOptions,
  ): MidiSendResult;
  cc(
    target: string | ResolvedMidiOutput,
    options: MidiCcOptions,
  ): MidiSendResult;
  allNotesOff(
    target: string | ResolvedMidiOutput,
    options?: MidiAllNotesOffOptions,
  ): MidiSendResult;
  send(
    target: string | ResolvedMidiOutput,
    data: Uint8Array | readonly number[],
    time?: number,
  ): MidiSendResult;
  clear(output: ResolvedMidiOutput): void;
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

interface WebMidiOutput extends WebMidiPort {
  send(data: Uint8Array | readonly number[], timestamp?: number): void;
  clear(): void;
}

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
  MidiAllNotesOffOptions,
  MidiCcOptions,
  MidiDevice,
  MidiInputs,
  MidiNote,
  MidiNoteOffOptions,
  MidiNoteOnOptions,
  MidiOutputs,
  MidiSendResult,
  MidiStatus,
  NoteSignal,
  ResolvedMidiOutput,
  Signal,
  WebMidiAccess,
  WebMidiInput,
  WebMidiMessageEvent,
  WebMidiOutput,
};

import { WritableSignal } from "./signal.js";
import type {
  CcSignal,
  MidiNote,
  NoteSignal,
  WebMidiInput,
  WebMidiMessageEvent,
} from "./types.js";

const validateChannel = (channel: number) => {
  if (!Number.isInteger(channel) || channel < 1 || channel > 16) {
    throw new RangeError("MIDI channel must be an integer from 1 to 16.");
  }
};

const validateCc = (cc: number) => {
  if (!Number.isInteger(cc) || cc < 0 || cc > 127) {
    throw new RangeError("MIDI CC number must be an integer from 0 to 127.");
  }
};

class MidiCcSignal extends WritableSignal<number> implements CcSignal {
  readonly raw = 0;
  readonly hasValue = false;
  readonly deviceId: string | null = null;
  readonly receivedChannel: number | null = null;

  constructor(
    private readonly _inputs: MidiInputs,
    private readonly _selector: string | undefined,
    private readonly _cc: number,
  ) {
    super(0);
  }

  channel(channel: number) {
    return this._inputs._cc(this._selector, this._cc, channel);
  }
}

class MidiNoteSignal
  extends WritableSignal<ReadonlySet<MidiNote>>
  implements NoteSignal
{
  constructor(
    private readonly _inputs: MidiInputs,
    private readonly _selector: string | undefined,
  ) {
    super(new Set<MidiNote>());
  }

  channel(channel: number) {
    return this._inputs._notes(this._selector, channel);
  }
}

class MidiInputs {
  private _ccSignals = new Map<string, MidiCcSignal>();
  private _noteSignals = new Map<string, MidiNoteSignal>();
  private _portListeners = new Map<
    WebMidiInput,
    (event: WebMidiMessageEvent) => void
  >();

  cc(cc: number): CcSignal;
  cc(selector: string, cc: number): CcSignal;
  cc(selectorOrCc: string | number, maybeCc?: number) {
    const selector =
      typeof selectorOrCc === "string" ? selectorOrCc : undefined;
    const cc = typeof selectorOrCc === "number" ? selectorOrCc : maybeCc;
    if (cc === undefined) {
      throw new TypeError("A MIDI CC number is required.");
    }
    return this._cc(selector, cc);
  }

  notes(selector?: string) {
    return this._notes(selector);
  }

  _setPorts(ports: readonly WebMidiInput[]) {
    const connected = new Set(ports);
    for (const [port, listener] of this._portListeners) {
      if (connected.has(port)) continue;
      port.removeEventListener("midimessage", listener);
      this._portListeners.delete(port);
    }

    for (const port of ports) {
      if (this._portListeners.has(port)) continue;
      const listener = () => {
        this._dispatch();
      };
      port.addEventListener("midimessage", listener);
      this._portListeners.set(port, listener);
    }
  }

  destroy() {
    this._setPorts([]);
  }

  private _dispatch() {
    // Message routing is introduced in Phase 1.3. Keeping this single
    // dispatcher here guarantees one native listener per connected port.
  }

  _cc(selector: string | undefined, cc: number, channel?: number) {
    validateCc(cc);
    if (channel !== undefined) validateChannel(channel);

    const key = JSON.stringify([selector ?? null, cc, channel ?? null]);
    let signal = this._ccSignals.get(key);
    if (!signal) {
      signal = new MidiCcSignal(this, selector, cc);
      this._ccSignals.set(key, signal);
    }
    return signal;
  }

  _notes(selector: string | undefined, channel?: number) {
    if (channel !== undefined) validateChannel(channel);

    const key = JSON.stringify([selector ?? null, channel ?? null]);
    let signal = this._noteSignals.get(key);
    if (!signal) {
      signal = new MidiNoteSignal(this, selector);
      this._noteSignals.set(key, signal);
    }
    return signal;
  }
}

export { MidiInputs };

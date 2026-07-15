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
  private _raw = 0;
  private _hasValue = false;
  private _deviceId: string | null = null;
  private _receivedChannel: number | null = null;

  constructor(
    private readonly _inputs: MidiInputs,
    private readonly _selector: string | undefined,
    private readonly _cc: number,
    private readonly _channel: number | undefined,
  ) {
    super(0);
  }

  get raw() {
    return this._raw;
  }

  get hasValue() {
    return this._hasValue;
  }

  get deviceId() {
    return this._deviceId;
  }

  get receivedChannel() {
    return this._receivedChannel;
  }

  channel(channel: number) {
    return this._inputs._cc(this._selector, this._cc, channel);
  }

  _accepts(port: WebMidiInput, cc: number, channel: number) {
    return (
      this._cc === cc &&
      (this._channel === undefined || this._channel === channel) &&
      this._inputs._matchesPort(this._selector, port)
    );
  }

  _receive(raw: number, deviceId: string, channel: number) {
    this._raw = raw;
    this._hasValue = true;
    this._deviceId = deviceId;
    this._receivedChannel = channel;
    this.set(raw / 127);
  }
}

class MidiNoteSignal
  extends WritableSignal<ReadonlySet<MidiNote>>
  implements NoteSignal
{
  private _held = new Map<string, MidiNote>();

  constructor(
    private readonly _inputs: MidiInputs,
    private readonly _selector: string | undefined,
    private readonly _channel: number | undefined,
  ) {
    super(new Set<MidiNote>());
  }

  channel(channel: number) {
    return this._inputs._notes(this._selector, channel);
  }

  _accepts(port: WebMidiInput, channel: number) {
    return (
      (this._channel === undefined || this._channel === channel) &&
      this._inputs._matchesPort(this._selector, port)
    );
  }

  _noteOn(deviceId: string, channel: number, note: number, velocity: number) {
    this._held.set(`${deviceId}:${channel}:${note}`, {
      note,
      velocity,
      deviceId,
      channel,
    });
    this._emitSnapshot();
  }

  _noteOff(deviceId: string, channel: number, note: number) {
    const removed = this._held.delete(`${deviceId}:${channel}:${note}`);
    if (removed) this._emitSnapshot();
  }

  _retainMatchingPorts(ports: readonly WebMidiInput[]) {
    const deviceIds = new Set(
      ports
        .filter((port) => this._inputs._matchesPort(this._selector, port))
        .map((port) => port.id),
    );
    let changed = false;
    for (const [key, note] of this._held) {
      if (deviceIds.has(note.deviceId)) continue;
      this._held.delete(key);
      changed = true;
    }
    if (changed) this._emitSnapshot();
  }

  private _emitSnapshot() {
    this.set(new Set(this._held.values()));
  }
}

class MidiInputs {
  private _ccSignals = new Map<string, MidiCcSignal>();
  private _noteSignals = new Map<string, MidiNoteSignal>();
  private _ports: readonly WebMidiInput[] = [];
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

    this._ports = ports;

    for (const port of ports) {
      if (this._portListeners.has(port)) continue;
      const listener = (event: WebMidiMessageEvent) => {
        this._dispatch(port, event);
      };
      port.addEventListener("midimessage", listener);
      this._portListeners.set(port, listener);
    }

    for (const signal of this._noteSignals.values()) {
      signal._retainMatchingPorts(ports);
    }
  }

  destroy() {
    this._setPorts([]);
  }

  _matchesPort(selector: string | undefined, port: WebMidiInput) {
    if (selector === undefined) return true;
    const idMatch = this._ports.find((candidate) => candidate.id === selector);
    if (idMatch) return idMatch === port;
    return (
      this._ports.find((candidate) => candidate.name === selector) === port
    );
  }

  private _dispatch(port: WebMidiInput, event: WebMidiMessageEvent) {
    if (event.data.length < 3) return;

    const [status, data1, data2] = event.data;
    const message = status & 0xf0;
    const channel = (status & 0x0f) + 1;

    if (message === 0xb0) {
      for (const signal of this._ccSignals.values()) {
        if (signal._accepts(port, data1, channel)) {
          signal._receive(data2, port.id, channel);
        }
      }
      return;
    }

    if (message !== 0x80 && message !== 0x90) return;
    const noteOn = message === 0x90 && data2 > 0;
    for (const signal of this._noteSignals.values()) {
      if (!signal._accepts(port, channel)) continue;
      if (noteOn) signal._noteOn(port.id, channel, data1, data2);
      else signal._noteOff(port.id, channel, data1);
    }
  }

  _cc(selector: string | undefined, cc: number, channel?: number) {
    validateCc(cc);
    if (channel !== undefined) validateChannel(channel);

    const key = JSON.stringify([selector ?? null, cc, channel ?? null]);
    let signal = this._ccSignals.get(key);
    if (!signal) {
      signal = new MidiCcSignal(this, selector, cc, channel);
      this._ccSignals.set(key, signal);
    }
    return signal;
  }

  _notes(selector: string | undefined, channel?: number) {
    if (channel !== undefined) validateChannel(channel);

    const key = JSON.stringify([selector ?? null, channel ?? null]);
    let signal = this._noteSignals.get(key);
    if (!signal) {
      signal = new MidiNoteSignal(this, selector, channel);
      this._noteSignals.set(key, signal);
    }
    return signal;
  }
}

export { MidiInputs };

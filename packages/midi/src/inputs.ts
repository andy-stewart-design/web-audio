import { WritableSignal } from "./signal.js";
import type {
  CcSignal,
  MidiInputs,
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
  private readonly controller: MidiInputsController;
  private readonly _selector: string | undefined;
  private readonly _cc: number;
  private readonly _channel: number | undefined;
  private _raw = 0;
  private _hasValue = false;
  private _deviceId: string | null = null;
  private _receivedChannel: number | null = null;

  constructor(
    controller: MidiInputsController,
    selector: string | undefined,
    cc: number,
    channel: number | undefined,
  ) {
    super(0);
    this.controller = controller;
    this._selector = selector;
    this._cc = cc;
    this._channel = channel;
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
    return this.controller.getCc(this._selector, this._cc, channel);
  }

  accepts(port: WebMidiInput, cc: number, channel: number) {
    return (
      this._cc === cc &&
      (this._channel === undefined || this._channel === channel) &&
      this.controller.matchesPort(this._selector, port)
    );
  }

  receive(raw: number, deviceId: string, channel: number) {
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
  private readonly controller: MidiInputsController;
  private readonly _selector: string | undefined;
  private readonly _channel: number | undefined;
  private _held = new Map<string, MidiNote>();

  constructor(
    controller: MidiInputsController,
    selector: string | undefined,
    channel: number | undefined,
  ) {
    super(new Set<MidiNote>());
    this.controller = controller;
    this._selector = selector;
    this._channel = channel;
  }

  channel(channel: number) {
    return this.controller.getNotes(this._selector, channel);
  }

  accepts(port: WebMidiInput, channel: number) {
    return (
      (this._channel === undefined || this._channel === channel) &&
      this.controller.matchesPort(this._selector, port)
    );
  }

  noteOn(deviceId: string, channel: number, note: number, velocity: number) {
    this._held.set(`${deviceId}:${channel}:${note}`, {
      note,
      velocity,
      deviceId,
      channel,
    });
    this._emitSnapshot();
  }

  noteOff(deviceId: string, channel: number, note: number) {
    const removed = this._held.delete(`${deviceId}:${channel}:${note}`);
    if (removed) this._emitSnapshot();
  }

  retainMatchingPorts(ports: readonly WebMidiInput[]) {
    const deviceIds = new Set(
      ports
        .filter((port) => this.controller.matchesPort(this._selector, port))
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

class MidiInputsController {
  private _ccSignals = new Map<string, MidiCcSignal>();
  private _noteSignals = new Map<string, MidiNoteSignal>();
  private _ports: readonly WebMidiInput[] = [];
  private _portListeners = new Map<
    WebMidiInput,
    (event: WebMidiMessageEvent) => void
  >();

  setPorts(ports: readonly WebMidiInput[]) {
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
      signal.retainMatchingPorts(ports);
    }
  }

  destroy() {
    this.setPorts([]);
  }

  matchesPort(selector: string | undefined, port: WebMidiInput) {
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
        if (signal.accepts(port, data1, channel)) {
          signal.receive(data2, port.id, channel);
        }
      }
      return;
    }

    if (message !== 0x80 && message !== 0x90) return;
    const noteOn = message === 0x90 && data2 > 0;
    for (const signal of this._noteSignals.values()) {
      if (!signal.accepts(port, channel)) continue;
      if (noteOn) signal.noteOn(port.id, channel, data1, data2);
      else signal.noteOff(port.id, channel, data1);
    }
  }

  getCc(selector: string | undefined, cc: number, channel?: number) {
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

  getNotes(selector: string | undefined, channel?: number) {
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

const createMidiInputs = () => {
  const controller = new MidiInputsController();

  function cc(cc: number): CcSignal;
  function cc(selector: string, cc: number): CcSignal;
  function cc(selectorOrCc: string | number, maybeCc?: number) {
    if (typeof selectorOrCc === "number") {
      return controller.getCc(undefined, selectorOrCc);
    }
    if (maybeCc === undefined) {
      throw new TypeError("A MIDI CC number is required.");
    }
    return controller.getCc(selectorOrCc, maybeCc);
  }

  const inputs: MidiInputs = {
    cc,
    notes: (selector) => controller.getNotes(selector),
  };

  return {
    inputs,
    setPorts: (ports: readonly WebMidiInput[]) => controller.setPorts(ports),
    destroy: () => controller.destroy(),
  };
};

export { createMidiInputs };

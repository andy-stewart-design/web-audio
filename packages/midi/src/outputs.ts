import type {
  MidiCcOptions,
  MidiNoteOffOptions,
  MidiNoteOnOptions,
  MidiOutputs,
  MidiSendResult,
  ResolvedMidiOutput,
  WebMidiOutput,
} from "./types.js";

const SENT = { sent: true } as const;
const UNAVAILABLE = { sent: false, reason: "unavailable" } as const;
const DESTROYED = { sent: false, reason: "destroyed" } as const;
const SEND_ERROR = { sent: false, reason: "send-error" } as const;

const validateDataByte = (name: string, value: number) => {
  if (!Number.isInteger(value) || value < 0 || value > 127) {
    throw new RangeError(`${name} must be an integer from 0 to 127.`);
  }
};

const validateChannel = (channel: number) => {
  if (!Number.isInteger(channel) || channel < 1 || channel > 16) {
    throw new RangeError("MIDI channel must be an integer from 1 to 16.");
  }
};

const validateTime = (time: number | undefined) => {
  if (time !== undefined && !Number.isFinite(time)) {
    throw new RangeError("MIDI send time must be finite.");
  }
};

const validateRawData = (data: Uint8Array | readonly number[]) => {
  if (!(data instanceof Uint8Array) && !Array.isArray(data)) {
    throw new TypeError(
      "MIDI data must be a Uint8Array or readonly byte array.",
    );
  }
  if (data.length === 0) {
    throw new RangeError("MIDI data must not be empty.");
  }
  for (const byte of data) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new RangeError("MIDI bytes must be integers from 0 to 255.");
    }
    if (byte === 0xf0 || byte === 0xf7) {
      throw new RangeError("SysEx messages are not supported.");
    }
  }
};

class MidiOutputsController {
  private _ports: readonly WebMidiOutput[] = [];
  private _handles = new WeakMap<ResolvedMidiOutput, WebMidiOutput>();
  private _destroyed = false;

  setPorts(ports: readonly WebMidiOutput[]) {
    this._ports = ports;
  }

  destroy() {
    this._destroyed = true;
    this._ports = [];
  }

  resolve(selector?: string) {
    if (this._destroyed) return null;
    const port = this._resolvePort(selector);
    if (!port) return null;

    const handle = Object.freeze({ id: port.id });
    this._handles.set(handle, port);
    return handle;
  }

  send(
    target: string | ResolvedMidiOutput,
    data: Uint8Array | readonly number[],
    time?: number,
  ): MidiSendResult {
    if (this._destroyed) return DESTROYED;

    const output =
      typeof target === "string"
        ? this._resolvePort(target)
        : this._handles.get(target);
    if (!output || output.state !== "connected") return UNAVAILABLE;

    try {
      if (time === undefined) output.send(data);
      else output.send(data, time);
      return SENT;
    } catch {
      return SEND_ERROR;
    }
  }

  clear(handle: ResolvedMidiOutput) {
    const output = this._handles.get(handle);
    if (!output || this._destroyed) return;
    try {
      output.clear();
    } catch {
      // Queue cleanup is best-effort when a native port has disappeared.
    }
  }

  private _resolvePort(selector?: string) {
    if (selector === undefined) return this._ports[0] ?? null;
    return (
      this._ports.find((port) => port.id === selector) ??
      this._ports.find((port) => port.name === selector) ??
      null
    );
  }
}

const createMidiOutputs = () => {
  const controller = new MidiOutputsController();

  const outputs: MidiOutputs = {
    resolve: (selector) => controller.resolve(selector),
    noteOn: (target, options: MidiNoteOnOptions) => {
      const velocity = options.velocity ?? 127;
      const channel = options.channel ?? 1;
      validateDataByte("MIDI note", options.note);
      validateDataByte("MIDI velocity", velocity);
      validateChannel(channel);
      validateTime(options.time);
      return controller.send(
        target,
        Uint8Array.of(0x90 | (channel - 1), options.note, velocity),
        options.time,
      );
    },
    noteOff: (target, options: MidiNoteOffOptions) => {
      const channel = options.channel ?? 1;
      validateDataByte("MIDI note", options.note);
      validateChannel(channel);
      validateTime(options.time);
      return controller.send(
        target,
        Uint8Array.of(0x80 | (channel - 1), options.note, 0),
        options.time,
      );
    },
    cc: (target, options: MidiCcOptions) => {
      const channel = options.channel ?? 1;
      validateDataByte("MIDI CC number", options.cc);
      validateDataByte("MIDI CC value", options.value);
      validateChannel(channel);
      validateTime(options.time);
      return controller.send(
        target,
        Uint8Array.of(0xb0 | (channel - 1), options.cc, options.value),
        options.time,
      );
    },
    send: (target, data, time) => {
      validateRawData(data);
      validateTime(time);
      return controller.send(target, data, time);
    },
    clear: (output) => controller.clear(output),
  };

  return {
    outputs,
    setPorts: (ports: readonly WebMidiOutput[]) => controller.setPorts(ports),
    destroy: () => controller.destroy(),
  };
};

export { createMidiOutputs };

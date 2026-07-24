import type { MidiCcSchema, MidiOutSchema } from "@web-audio/schema";

const validateProtocolValue = (
  name: string,
  value: number,
  min: number,
  max: number,
) => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(
      `[Midi] ${name} must be an integer from ${min} to ${max}.`,
    );
  }
};

const validateFinite = (name: string, value: number) => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`[Midi] ${name} must be finite.`);
  }
};

const clampToRange = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));

type MidiCcDefaults = Pick<MidiCcSchema, "range" | "default">;

const MIDI_CC_CONTEXTS = {
  gain: {
    range: { min: 0, max: 1, curve: "linear" },
    default: 1,
  },
  frequency: {
    range: { min: 20, max: 20_000, curve: "exponential" },
    default: 1_000,
  },
  q: {
    range: { min: 0, max: 30, curve: "linear" },
    default: 1,
  },
  detune: {
    range: { min: -1_200, max: 1_200, curve: "linear" },
    default: 0,
  },
  filterGain: {
    range: { min: -24, max: 24, curve: "linear" },
    default: 0,
  },
} satisfies Record<string, MidiCcDefaults>;

type MidiCcContext = keyof typeof MIDI_CC_CONTEXTS;

class MidiOut {
  private _channel = 1;
  private _device: string | undefined;
  chan: (channel: number) => this;

  constructor(device?: string) {
    this._device = device;
    this.chan = this.channel.bind(this);
  }

  channel(channel: number) {
    validateProtocolValue("channel", channel, 1, 16);
    this._channel = channel;
    return this;
  }

  getSchema() {
    return {
      type: "midi-out" as const,
      ...(this._device !== undefined && { device: this._device }),
      channel: this._channel,
    } satisfies MidiOutSchema;
  }
}

class MidiCc {
  private _cc: number;
  private _device: string | undefined;
  private _channel: number | undefined;
  private _range: MidiCcSchema["range"] | undefined;
  private _default: number | undefined;
  chan: (channel: number) => this;

  constructor(cc: number, device?: string) {
    validateProtocolValue("CC number", cc, 0, 127);
    this._cc = cc;
    this._device = device;
    this.chan = this.channel.bind(this);
  }

  channel(channel: number) {
    validateProtocolValue("channel", channel, 1, 16);
    this._channel = channel;
    return this;
  }

  range(min: number, max: number) {
    validateFinite("range minimum", min);
    validateFinite("range maximum", max);
    this._range = { min, max, curve: "linear" };
    return this;
  }

  expRange(min: number, max: number) {
    validateFinite("range minimum", min);
    validateFinite("range maximum", max);
    if (min <= 0 || max <= 0) {
      throw new RangeError(
        "[Midi] exponential range endpoints must be positive.",
      );
    }
    this._range = { min, max, curve: "exponential" };
    return this;
  }

  default(value: number) {
    validateFinite("default", value);
    this._default = value;
    return this;
  }

  getSchema(context?: MidiCcContext) {
    const contextual =
      context === undefined ? undefined : MIDI_CC_CONTEXTS[context];
    const range = this._range ?? contextual?.range;
    const defaultValue = this._default ?? contextual?.default;
    if (!range || defaultValue === undefined) {
      throw new Error("[Midi] MIDI CC requires a range and default value.");
    }

    return {
      type: "midi-cc" as const,
      cc: this._cc,
      ...(this._device !== undefined && { device: this._device }),
      ...(this._channel !== undefined && { channel: this._channel }),
      range,
      default: clampToRange(defaultValue, range.min, range.max),
    } satisfies MidiCcSchema;
  }
}

class MidiBuilders {
  out(device?: string) {
    return new MidiOut(device);
  }

  cc(cc: number): MidiCc;
  cc(device: string, cc: number): MidiCc;
  cc(deviceOrCc: string | number, maybeCc?: number) {
    if (typeof deviceOrCc === "number") return new MidiCc(deviceOrCc);
    if (maybeCc === undefined) {
      throw new TypeError("[Midi] a CC number is required.");
    }
    return new MidiCc(maybeCc, deviceOrCc);
  }
}

export { MidiBuilders, MidiCc, MidiOut };
export type { MidiCcContext };

import {
  euclid,
  hex,
  sequence,
  type EventCycleTransform,
  type RandomCycle,
  type ScheduledValue,
} from "@web-audio/patterns";
import Envelope, { type ADSR } from "@/automations/envelope";
import Filter from "@/effects/filter";
import GainEffect from "@/effects/gain";
import type { InstrumentEventState } from "@/events/state";
import {
  composeEventTiming,
  replaceEventNotes,
  replaceEventTiming,
  setEventPitch,
  transformEventState,
} from "@/events/transitions";
import { decodeNotesInputGeometry } from "@/inputs/decode-structured-input";
import { decodeXoxInputGeometry } from "@/inputs/decode-xox-input";
import Parameter, {
  type AudioParamInput,
  type AudioParamSource,
} from "@/parameters/parameter";
import {
  isEnvelopeTuple,
  isLfoTuple,
  isMidiCcTuple,
  isRandomCycleTuple,
} from "@/inputs/guards";
import type { CycleInput, ShorthandInput } from "@/inputs/types";
import type { KeyNotation, NoteName, NoteValue } from "@/pitch/types";
import { parseKey } from "@/pitch/parse-key";
import type { ScaleAlias } from "@/pitch/get-scale";
import type {
  DuckSchema,
  SamplerSchema,
  SynthesizerSchema,
} from "@web-audio/schema";
import type Drome from "@/drome";

type NoteOrChord<T> = T | T[];
type NoteInput<T> = (NoteOrChord<T> | NoteOrChord<T>[])[];

const DEFAULT_GAIN_ENVELOPE = { a: 0.01, d: 0, s: 1, r: 0.01 } satisfies ADSR;

abstract class Instrument {
  protected abstract _eventState: InstrumentEventState;
  protected _detune: AudioParamSource;
  protected _gain: Envelope;
  protected _effects: (Filter | GainEffect)[] = [];
  protected _host: Drome | undefined;
  protected _muted = false;
  protected _legato = false;
  protected _route = "main";
  protected _sends = new Map<string, number>();
  protected _ducks = new Map<string, DuckSchema>();
  leg: (enabled?: boolean) => this;

  constructor(host?: Drome, gainEnvelope: Partial<ADSR> = {}) {
    this._detune = new Parameter(0);
    const { a, d, s, r } = { ...DEFAULT_GAIN_ENVELOPE, ...gainEnvelope };
    this._gain = new Envelope().adsr(a, d, s, r);
    this._host = host;
    this.leg = this.legato.bind(this);
  }

  abstract getSchema(): SynthesizerSchema | SamplerSchema;

  push() {
    this._host?.push(this);
    return this;
  }

  notes(input: ShorthandInput): this;
  notes(...input: NoteInput<ScheduledValue> | [RandomCycle]): this;
  notes(
    ...input: NoteInput<ScheduledValue> | [RandomCycle] | [ShorthandInput]
  ) {
    const decoded = decodeNotesInputGeometry(input, { allowShorthand: true });
    this._eventState = replaceEventNotes(
      this._eventState,
      decoded.cycle,
      decoded.zeroWidthPatterns,
      "noteValueSlots" in decoded ? decoded.noteValueSlots : undefined,
    );
    return this;
  }

  root(n: NoteName | NoteValue | number) {
    this._eventState = setEventPitch(this._eventState, { root: n });
    return this;
  }

  scale(name: ScaleAlias) {
    this._eventState = setEventPitch(this._eventState, { scale: name });
    return this;
  }

  key(notation: KeyNotation) {
    this._eventState = setEventPitch(this._eventState, parseKey(notation));
    return this;
  }

  legato(enabled = true) {
    this._legato = enabled;
    return this;
  }

  euclid(
    pulses: number | number[],
    steps: number,
    rotation: number | number[] = 0,
  ) {
    this._composeTiming(euclid(pulses, steps, rotation));
    return this;
  }

  hex(...hexes: (string | number)[]) {
    this._composeTiming(hexes.map(hex));
    return this;
  }

  reverse() {
    this._transformEvents({ type: "reverse" });
    return this;
  }

  sequence(steps: number, ...pulses: (number | number[])[]) {
    this._composeTiming(sequence(steps, ...pulses));
    return this;
  }

  xox(input: ShorthandInput): this;
  xox(...input: (number | number[])[] | [RandomCycle]): this;
  xox(...input: (number | number[])[] | [RandomCycle] | [ShorthandInput]) {
    const decoded = decodeXoxInputGeometry(input, { allowShorthand: true });
    this._eventState = isRandomCycleTuple(input)
      ? replaceEventTiming(
          this._eventState,
          decoded.cycle,
          decoded.condition,
          decoded.zeroWidthPatterns,
        )
      : composeEventTiming(
          this._eventState,
          decoded.cycle,
          decoded.zeroWidthPatterns,
        );
    return this;
  }

  fast(multiplier: number) {
    this._transformEvents({ type: "fast", multiplier });
    return this;
  }

  slow(multiplier: number) {
    this._transformEvents({ type: "slow", multiplier });
    return this;
  }

  stretch(bars: number, steps?: number) {
    this._transformEvents({ type: "stretch", bars, steps });
    return this;
  }

  protected _transformEvents(operation: EventCycleTransform) {
    this._eventState = transformEventState(this._eventState, operation);
  }

  private _composeTiming(input: (number | number[])[]) {
    const decoded = decodeXoxInputGeometry(input);
    this._eventState = composeEventTiming(
      this._eventState,
      decoded.cycle,
      decoded.zeroWidthPatterns,
    );
  }

  detune(...input: AudioParamInput) {
    if (isLfoTuple(input)) {
      this._detune = input[0];
    } else if (isEnvelopeTuple(input)) {
      this._detune = input[0];
    } else if (isMidiCcTuple(input)) {
      this._detune = input[0];
    } else {
      this._detune = new Parameter(...input);
    }
    return this;
  }

  mute(enabled = true) {
    this._muted = enabled;
    return this;
  }

  route(target: string) {
    this._route = normalizeTarget(target, "route()");
    return this;
  }

  send(target: string | string[], amount: number) {
    if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
      throw new Error(
        "[Instrument] send() amount must be a finite number in [0, 1].",
      );
    }
    const targets = Array.isArray(target) ? target : [target];
    for (const value of targets) {
      const normalized = normalizeTarget(value, "send()");
      if (normalized === "main") {
        throw new Error("[Instrument] send() cannot target main.");
      }
      this._sends.set(normalized, amount);
    }
    return this;
  }

  duck(target: string | string[], depth = 1, onset = 0, recovery = 1) {
    if (!Number.isFinite(depth)) {
      throw new Error("[Instrument] duck() depth must be finite.");
    }
    if (!Number.isFinite(onset)) {
      throw new Error("[Instrument] duck() onset must be finite.");
    }
    if (!Number.isFinite(recovery)) {
      throw new Error("[Instrument] duck() recovery must be finite.");
    }

    const configuration = {
      depth: Math.min(1, Math.max(0, depth)),
      onset: Math.max(0, onset),
      recovery: Math.max(0, recovery),
    } satisfies DuckSchema;
    const targets = Array.isArray(target) ? target : [target];
    for (const value of targets) {
      const normalized = normalizeTarget(value, "duck()");
      if (normalized === "main") {
        throw new Error("[Instrument] duck() cannot target main.");
      }
      this._ducks.set(normalized, configuration);
    }
    return this;
  }

  gain(...input: CycleInput<number> | [Envelope]) {
    if (isEnvelopeTuple(input)) {
      this._gain = input[0];
    } else {
      this._gain.max(...input);
    }
    return this;
  }

  adsr(
    a: number | number[],
    d: number | number[],
    s: number | number[],
    r: number | number[],
  ) {
    this._gain.adsr(a, d, s, r);
    return this;
  }

  fx(...effects: (Filter | GainEffect)[]) {
    this._effects.push(...effects);
    return this;
  }
}

function normalizeTarget(target: string, method: string) {
  const normalized = target.trim();
  if (normalized === "") {
    throw new Error(`[Instrument] ${method} target cannot be empty.`);
  }
  return normalized;
}

export default Instrument;

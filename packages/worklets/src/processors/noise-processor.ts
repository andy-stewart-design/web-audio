const UINT32_SCALE = 1 / 0x1_0000_0000;
const DEFAULT_SEED = 0x6d2b79f5;
const REFERENCE_SAMPLE_RATE = 48_000;
const PINK_DC_POLE = 0.9999;

type NoiseColor = "white" | "pink";
type NoiseMessage =
  | { type: "start"; frame: number }
  | { type: "stop"; frame: number }
  | { type: "cancel" };

interface NoiseProcessorOptions {
  processorOptions?: {
    color?: NoiseColor;
    seed?: number;
    startFrame?: number;
    stopFrame?: number;
  };
}

function finiteOr(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function seedValue(seed: number | undefined) {
  const value = Math.trunc(finiteOr(seed, 0)) >>> 0;
  return value === 0 ? DEFAULT_SEED : value;
}

class NoiseProcessor extends AudioWorkletProcessor {
  private readonly _color: NoiseColor;
  private _state: number;
  private _startFrame: number;
  private _stopFrame: number;
  private _pinkB0 = 0;
  private _pinkB1 = 0;
  private _pinkB2 = 0;
  private _pinkB3 = 0;
  private _pinkB4 = 0;
  private _pinkB5 = 0;
  private _pinkB6 = 0;
  private _pinkPrevious = 0;
  private _pinkPreviousOutput = 0;
  private readonly _pinkDcPole: number;
  private _completed = false;

  constructor(options: NoiseProcessorOptions = {}) {
    super();
    const processorOptions = options.processorOptions ?? {};
    this._color = processorOptions.color === "pink" ? "pink" : "white";
    this._state = seedValue(processorOptions.seed);
    this._pinkDcPole = PINK_DC_POLE ** (REFERENCE_SAMPLE_RATE / sampleRate);
    this._startFrame = finiteOr(
      processorOptions.startFrame,
      Number.POSITIVE_INFINITY,
    );
    this._stopFrame = finiteOr(
      processorOptions.stopFrame,
      Number.POSITIVE_INFINITY,
    );

    this.port.onmessage = (event: MessageEvent<unknown>) => {
      this._handleMessage(event.data);
    };
  }

  private _handleMessage(message: unknown) {
    if (typeof message !== "object" || message === null) return;
    const candidate = message as Partial<NoiseMessage>;
    if (candidate.type === "cancel") {
      this._complete();
      return;
    }
    if (
      (candidate.type !== "start" && candidate.type !== "stop") ||
      typeof candidate.frame !== "number" ||
      !Number.isFinite(candidate.frame)
    )
      return;

    if (candidate.type === "start") {
      this._startFrame = candidate.frame;
    } else {
      this._stopFrame = candidate.frame;
    }

    if (this._stopFrame <= this._startFrame || this._stopFrame <= currentFrame)
      this._complete();
  }

  private _complete() {
    if (this._completed) return;
    this._completed = true;
    this.port.postMessage({ type: "ended" });
  }

  private _nextWhite() {
    let state = this._state;
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    this._state = state >>> 0;
    return this._state * UINT32_SCALE * 2 - 1;
  }

  private _nextPink() {
    const white = this._nextWhite();
    this._pinkB0 = 0.99886 * this._pinkB0 + white * 0.0555179;
    this._pinkB1 = 0.99332 * this._pinkB1 + white * 0.0750759;
    this._pinkB2 = 0.969 * this._pinkB2 + white * 0.153852;
    this._pinkB3 = 0.8665 * this._pinkB3 + white * 0.310486;
    this._pinkB4 = 0.55 * this._pinkB4 + white * 0.532952;
    // These published Kellett coefficients are a fixed-rate approximation;
    // the DC pole below is scaled to preserve its time constant per sample rate.
    this._pinkB5 = -0.7616 * this._pinkB5 - white * 0.016898;
    const pink =
      this._pinkB0 +
      this._pinkB1 +
      this._pinkB2 +
      this._pinkB3 +
      this._pinkB4 +
      this._pinkB5 +
      this._pinkB6 +
      white * 0.5362;
    this._pinkB6 = white * 0.115926;
    const calibrated = pink * 0.33;
    const filtered =
      calibrated -
      this._pinkPrevious +
      this._pinkDcPole * this._pinkPreviousOutput;
    this._pinkPrevious = calibrated;
    this._pinkPreviousOutput = filtered;
    return filtered;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const outputChannels = outputs[0];
    const frameCount = outputChannels?.[0]?.length ?? 0;
    if (!outputChannels || frameCount === 0) return !this._completed;

    for (const channel of outputChannels) channel.fill(0);
    if (this._completed) return false;

    const blockStart = currentFrame;
    const blockEnd = blockStart + frameCount;
    if (this._stopFrame <= blockStart) {
      this._complete();
      return false;
    }

    const firstSample = Math.max(0, Math.ceil(this._startFrame - blockStart));
    const lastSample = Math.min(
      frameCount,
      Math.ceil(this._stopFrame - blockStart),
    );
    const output = outputChannels[0];
    for (let index = firstSample; index < lastSample; index++) {
      output[index] =
        this._color === "pink" ? this._nextPink() : this._nextWhite();
    }

    if (this._stopFrame <= blockEnd) {
      this._complete();
      return false;
    }
    return true;
  }
}

registerProcessor("noise-processor", NoiseProcessor);

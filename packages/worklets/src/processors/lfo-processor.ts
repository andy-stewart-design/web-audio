import { sine, triangle, sawtooth, square } from "@/utils/waveforms";

type WaveformType = "sine" | "triangle" | "square" | "sawtooth";
type WaveformFn = (phase: number) => number;

const WAVEFORM_FNS: Record<WaveformType, WaveformFn> = {
  sine,
  triangle,
  sawtooth,
  square,
};

interface LfoProcessorOptions {
  processorOptions: {
    waveform: WaveformType[];
    speed: number[];
    initialPhase: number;
    norm: boolean;
    invert: boolean;
    barDuration: number;
    barOriginTime: number;
  };
}

class LfoProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "outputA", defaultValue: 0, automationRate: "a-rate" as const },
      { name: "outputB", defaultValue: 0, automationRate: "a-rate" as const },
    ];
  }

  private _waveforms: WaveformType[];
  private _speeds: number[];
  private _phase: number;
  private _norm: boolean;
  private _invert: boolean;
  private _barDuration: number;
  private _waveformIndex: number;
  private _speedIndex: number;
  private _prevOutput: number;
  // Absolute-time fields (single-speed only)
  private _isSingleSpeed: boolean;
  private _initialPhase: number;
  private _barOriginTime: number;
  private _phasePerSample: number;
  // One-time sync flag (multi-speed fallback)
  private _needsSync: boolean;

  constructor(options: LfoProcessorOptions) {
    super();
    const opts = options.processorOptions;
    this._waveforms = opts.waveform;
    this._speeds = opts.speed;
    this._norm = opts.norm;
    this._invert = opts.invert;
    this._barDuration = opts.barDuration;
    this._initialPhase = opts.initialPhase;
    this._barOriginTime = opts.barOriginTime;
    this._isSingleSpeed = opts.speed.length === 1;
    this._phasePerSample = opts.speed[0] / (opts.barDuration * sampleRate);
    this._waveformIndex = 0;
    this._speedIndex = 0;
    this._phase = 0;
    this._prevOutput = 0;
    this._needsSync = true;
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0][0];
    if (!output) return true;

    const outputA = parameters.outputA;
    const outputB = parameters.outputB;
    const barSamples = this._barDuration * sampleRate;

    if (this._isSingleSpeed) {
      // Derive phase from absolute time — immune to drift and startup
      // timing mismatches. currentFrame is the exact audio-thread time.
      const elapsed = currentFrame / sampleRate - this._barOriginTime;
      const absolutePhase = this._initialPhase + elapsed * this._speeds[0] / this._barDuration;
      this._phase = ((absolutePhase % 1.0) + 1.0) % 1.0;
      const totalCycles = Math.floor(absolutePhase);
      this._waveformIndex = ((totalCycles % this._waveforms.length) + this._waveforms.length) % this._waveforms.length;

      if (this._needsSync) {
        this._prevOutput = WAVEFORM_FNS[this._waveforms[this._waveformIndex]](this._phase);
        this._needsSync = false;
      }
    } else if (this._needsSync) {
      // Multi-speed fallback: one-time sync using currentFrame, then
      // accumulate sample-by-sample (absolute computation isn't feasible
      // with varying speeds per cycle).
      const currentTime = currentFrame / sampleRate;
      const leadTime = (this._barOriginTime + this._initialPhase / this._speeds[0] * this._barDuration) - currentTime;
      const basePhase = this._initialPhase + Math.round((currentTime - this._barOriginTime) / this._barDuration) * this._speeds[0];
      const preAdvance = (leadTime * this._speeds[0]) / this._barDuration;
      this._phase = (((basePhase - preAdvance) % 1.0) + 1.0) % 1.0;
      this._prevOutput = WAVEFORM_FNS[this._waveforms[0]](this._phase);
      this._needsSync = false;
    }

    for (let i = 0; i < output.length; i++) {
      const a = outputA.length > 1 ? outputA[i] : outputA[0];
      const b = outputB.length > 1 ? outputB[i] : outputB[0];

      const waveformFn = WAVEFORM_FNS[this._waveforms[this._waveformIndex]];
      const raw = waveformFn(this._phase);
      // Slew limiter: caps rate of change to avoid hard clicks on square wave
      // transitions. 256 samples (~5.8ms at 44100Hz) to traverse the full range.
      const maxDelta = 2 / 256;
      const slewed = Math.max(
        this._prevOutput - maxDelta,
        Math.min(this._prevOutput + maxDelta, raw),
      );
      this._prevOutput = slewed;
      let oscValue = slewed;
      if (this._invert) oscValue = -oscValue;
      if (this._norm) oscValue = (oscValue + 1) * 0.5;

      output[i] = a + b * oscValue;

      const speed = this._speeds[this._speedIndex];
      this._phase += speed / barSamples;
      if (this._phase >= 1.0) {
        this._phase -= 1.0;
        this._waveformIndex =
          (this._waveformIndex + 1) % this._waveforms.length;
        this._speedIndex = (this._speedIndex + 1) % this._speeds.length;
      }
    }

    return true;
  }
}

registerProcessor("lfo-processor", LfoProcessor);

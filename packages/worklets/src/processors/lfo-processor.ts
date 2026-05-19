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
    basePhase: number;
    norm: boolean;
    invert: boolean;
    barDuration: number;
    barStartTime: number;
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
  private _needsSync: boolean;
  private _basePhase: number;
  private _barStartTime: number;

  constructor(options: LfoProcessorOptions) {
    super();
    const opts = options.processorOptions;
    this._waveforms = opts.waveform;
    this._speeds = opts.speed;
    this._norm = opts.norm;
    this._invert = opts.invert;
    this._barDuration = opts.barDuration;
    this._basePhase = opts.basePhase;
    this._barStartTime = opts.barStartTime;
    this._waveformIndex = 0;
    this._speedIndex = 0;
    this._prevOutput = 0;
    // Phase is computed on the first process() call using currentFrame,
    // which gives us the exact audio-thread time and eliminates the
    // JS↔audio timing mismatch from the old preAdvance approach.
    this._phase = 0;
    this._needsSync = true;
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0][0];
    if (!output) return true;

    if (this._needsSync) {
      // Compute the exact preAdvance using the audio thread's currentFrame,
      // which is precise — unlike ctx.currentTime read from the JS thread.
      const currentTime = currentFrame / sampleRate;
      const leadTime = this._barStartTime - currentTime;
      const preAdvance =
        (leadTime * this._speeds[0]) / this._barDuration;
      this._phase =
        (((this._basePhase - preAdvance) % 1.0) + 1.0) % 1.0;
      // Seed the slew limiter with the raw waveform value so it doesn't
      // ramp from 0 on the first sample.
      this._prevOutput = WAVEFORM_FNS[this._waveforms[0]](this._phase);
      this._needsSync = false;
    }

    const outputA = parameters.outputA;
    const outputB = parameters.outputB;
    const barSamples = this._barDuration * sampleRate;

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

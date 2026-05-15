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
    phase: number;
    norm: boolean;
    invert: boolean;
    barDuration: number;
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

  constructor(options: LfoProcessorOptions) {
    super();
    const opts = options.processorOptions;
    this._waveforms = opts.waveform;
    this._speeds = opts.speed;
    this._phase = opts.phase;
    this._norm = opts.norm;
    this._invert = opts.invert;
    this._barDuration = opts.barDuration;
    this._waveformIndex = 0;
    this._speedIndex = 0;
    this._prevOutput = 0;
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

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
  private _needsSync: boolean;
  // Precomputed for absolute-time phase derivation
  private _adjustedOriginTime: number;
  private _cumBars: number[];
  private _periodBars: number;

  constructor(options: LfoProcessorOptions) {
    super();
    const opts = options.processorOptions;
    this._waveforms = opts.waveform;
    this._speeds = opts.speed;
    this._norm = opts.norm;
    this._invert = opts.invert;
    this._barDuration = opts.barDuration;
    this._waveformIndex = 0;
    this._speedIndex = 0;
    this._phase = 0;
    this._prevOutput = 0;
    this._needsSync = true;

    // Precompute cumulative bar fractions per speed segment.
    // For speed [2, 1]: segment 0 takes 1/2 bar, segment 1 takes 1 bar,
    // so cumBars = [0, 0.5, 1.5] and periodBars = 1.5.
    this._cumBars = [0];
    for (let i = 0; i < this._speeds.length; i++) {
      this._cumBars.push(this._cumBars[i] + 1 / this._speeds[i]);
    }
    this._periodBars = this._cumBars[this._speeds.length];

    // Convert initialPhase (in cycles) to an equivalent bar offset and
    // bake it into the origin time so elapsed-bar calculations naturally
    // include it.
    let remainingPhase = opts.initialPhase;
    let initialBars = 0;
    let segIdx = 0;
    while (remainingPhase >= 1.0) {
      initialBars += 1 / this._speeds[segIdx % this._speeds.length];
      remainingPhase -= 1.0;
      segIdx++;
    }
    if (remainingPhase > 0) {
      initialBars += remainingPhase / this._speeds[segIdx % this._speeds.length];
    }
    this._adjustedOriginTime =
      opts.barOriginTime - initialBars * opts.barDuration;
  }

  // Derive phase, speed index, and waveform index from the absolute
  // audio timeline. Called at the start of every process() quantum so
  // the LFO is always perfectly locked to the bar grid — no
  // accumulation drift, no startup-timing sensitivity.
  private _syncPhase(): void {
    const elapsedBars =
      (currentFrame / sampleRate - this._adjustedOriginTime) / this._barDuration;

    // Which complete speed-period are we in?
    const completePeriods = Math.floor(elapsedBars / this._periodBars);
    const barsInPeriod = elapsedBars - completePeriods * this._periodBars;

    // Which speed segment within this period?
    let k = 0;
    while (
      k < this._speeds.length - 1 &&
      barsInPeriod >= this._cumBars[k + 1]
    ) {
      k++;
    }

    const barsInSegment = barsInPeriod - this._cumBars[k];
    const phaseInCycle = barsInSegment * this._speeds[k];
    const totalCycles = completePeriods * this._speeds.length + k;

    this._phase = ((phaseInCycle % 1.0) + 1.0) % 1.0;
    this._speedIndex = k;
    this._waveformIndex =
      ((totalCycles % this._waveforms.length) + this._waveforms.length) %
      this._waveforms.length;
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0][0];
    if (!output) return true;

    this._syncPhase();

    if (this._needsSync) {
      this._prevOutput =
        WAVEFORM_FNS[this._waveforms[this._waveformIndex]](this._phase);
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

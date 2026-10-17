const MAX_VOICES = 8;
const DEFAULT_VOICES = 7;
const DEFAULT_FREQUENCY = 440;
const DEFAULT_SPREAD = 10;
const DEFAULT_WIDTH = 0.4;
const UINT32_SCALE = 1 / 0x1_0000_0000;

type SupersawMessage =
  | { type: "start"; frame: number }
  | { type: "stop"; frame: number };

interface SupersawProcessorOptions {
  processorOptions?: {
    voices?: number;
    phaseSeed?: number;
    startFrame?: number;
    stopFrame?: number;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function resolveVoices(value: number) {
  return clamp(Math.round(finiteOr(value, DEFAULT_VOICES)), 1, MAX_VOICES);
}

function hashPhase(seed: number, voice: number) {
  let value =
    (Math.trunc(finiteOr(seed, 0)) ^ Math.imul(voice + 1, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  value ^= value >>> 16;
  return (value >>> 0) * UINT32_SCALE;
}

function polyBlep(phase: number, phaseIncrement: number) {
  if (phaseIncrement <= 0 || phaseIncrement >= 1) return 0;
  if (phase < phaseIncrement) {
    const t = phase / phaseIncrement;
    return t + t - t * t - 1;
  }
  if (phase > 1 - phaseIncrement) {
    const t = (phase - 1) / phaseIncrement;
    return t * t + t + t + 1;
  }
  return 0;
}

function safeAdd(left: number, right: number) {
  if (left > 0 && right > Number.MAX_VALUE - left) return Number.MAX_VALUE;
  if (left < 0 && right < -Number.MAX_VALUE - left) return -Number.MAX_VALUE;
  return left + right;
}

function safeFrequency(frequency: number, cents: number) {
  if (!Number.isFinite(frequency) || frequency === 0) return 0;

  const nyquist = sampleRate * 0.5;
  if (!Number.isFinite(nyquist) || nyquist <= 0) return 0;

  const magnitudeLog =
    Math.log2(Math.abs(frequency)) + finiteOr(cents, 0) / 1200;
  const nyquistLog = Math.log2(nyquist);
  if (magnitudeLog >= nyquistLog) return Math.sign(frequency) * nyquist;
  if (magnitudeLog <= -1074) return 0;

  const magnitude = 2 ** magnitudeLog;
  return Number.isFinite(magnitude) ? Math.sign(frequency) * magnitude : 0;
}

function parameterValue(
  parameters: Record<string, Float32Array>,
  name: string,
  index: number,
  fallback: number,
) {
  const values = parameters[name];
  if (!values || values.length === 0) return fallback;
  return values.length > 1 ? values[index] : values[0];
}

class SupersawProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "frequency",
        defaultValue: DEFAULT_FREQUENCY,
        automationRate: "a-rate" as const,
      },
      { name: "detune", defaultValue: 0, automationRate: "a-rate" as const },
      {
        name: "spread",
        defaultValue: DEFAULT_SPREAD,
        automationRate: "a-rate" as const,
      },
      {
        name: "width",
        defaultValue: DEFAULT_WIDTH,
        automationRate: "a-rate" as const,
      },
    ];
  }

  private readonly _voices: number;
  private readonly _phase: Float64Array;
  private readonly _panPosition: Float64Array;
  private readonly _voiceGain: number;
  private _startFrame: number;
  private _stopFrame: number;
  private _completed = false;

  constructor(options: SupersawProcessorOptions = {}) {
    super();

    const processorOptions = options.processorOptions ?? {};
    this._voices = resolveVoices(processorOptions.voices ?? DEFAULT_VOICES);
    this._phase = new Float64Array(this._voices);
    this._panPosition = new Float64Array(this._voices);
    this._voiceGain = 1 / Math.sqrt(this._voices);
    const startFrame = processorOptions.startFrame;
    const stopFrame = processorOptions.stopFrame;
    this._startFrame =
      startFrame !== undefined && Number.isFinite(startFrame)
        ? startFrame
        : Number.POSITIVE_INFINITY;
    this._stopFrame =
      stopFrame !== undefined && Number.isFinite(stopFrame)
        ? stopFrame
        : Number.POSITIVE_INFINITY;

    for (let voice = 0; voice < this._voices; voice++) {
      this._phase[voice] = hashPhase(processorOptions.phaseSeed ?? 0, voice);
      this._panPosition[voice] =
        this._voices === 1 ? 0 : (voice / (this._voices - 1)) * 2 - 1;
    }

    this.port.onmessage = (event: MessageEvent<SupersawMessage>) => {
      this._handleMessage(event.data);
    };
  }

  private _handleMessage(message: SupersawMessage) {
    if (!message || !Number.isFinite(message.frame)) return;

    if (message.type === "start") {
      this._startFrame = message.frame;
      return;
    }

    this._stopFrame = message.frame;
    if (
      this._stopFrame <= this._startFrame ||
      this._stopFrame <= currentFrame
    ) {
      this._complete();
    }
  }

  private _complete() {
    if (this._completed) return;
    this._completed = true;
    this.port.postMessage({ type: "ended" });
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ) {
    const outputChannels = outputs[0];
    const frameCount = outputChannels?.[0]?.length ?? 0;
    if (!outputChannels || frameCount === 0) return !this._completed;

    for (const channel of outputChannels) channel.fill(0);
    if (this._completed) return false;

    const blockStart = currentFrame;
    const blockEnd = blockStart + frameCount;
    const firstSample = Math.max(0, Math.ceil(this._startFrame - blockStart));
    const lastSample = Math.min(
      frameCount,
      Math.ceil(this._stopFrame - blockStart),
    );

    for (let index = firstSample; index < lastSample; index++) {
      const frequency = parameterValue(
        parameters,
        "frequency",
        index,
        DEFAULT_FREQUENCY,
      );
      const detune = parameterValue(parameters, "detune", index, 0);
      const spread = Math.max(
        0,
        finiteOr(
          parameterValue(parameters, "spread", index, DEFAULT_SPREAD),
          0,
        ),
      );
      const width = clamp(
        finiteOr(parameterValue(parameters, "width", index, DEFAULT_WIDTH), 0),
        0,
        1,
      );
      let left = 0;
      let right = 0;

      for (let voice = 0; voice < this._voices; voice++) {
        const phase = this._phase[voice];
        const offset = this._panPosition[voice] * spread;
        const voiceFrequency = safeFrequency(
          frequency,
          safeAdd(finiteOr(detune, 0), offset),
        );
        const phaseIncrement = voiceFrequency / sampleRate;
        const phaseStep = clamp(phaseIncrement, -0.5, 0.5);
        const sample = 2 * phase - 1 - polyBlep(phase, Math.abs(phaseStep));
        const pan = this._panPosition[voice] * width;
        const panAngle = ((pan + 1) * Math.PI) / 4;
        const gain = this._voiceGain;

        left += sample * Math.cos(panAngle) * gain;
        right += sample * Math.sin(panAngle) * gain;
        this._phase[voice] = phase + phaseStep;
        if (this._phase[voice] >= 1) this._phase[voice] -= 1;
        else if (this._phase[voice] < 0) this._phase[voice] += 1;
      }

      const leftSample = Number.isFinite(left) ? left : 0;
      const rightSample = Number.isFinite(right) ? right : 0;
      if (outputChannels[0]) outputChannels[0][index] = leftSample;
      if (outputChannels[1]) outputChannels[1][index] = rightSample;
    }

    if (this._stopFrame <= blockEnd) {
      this._complete();
      return false;
    }
    return true;
  }
}

registerProcessor("supersaw-processor", SupersawProcessor);

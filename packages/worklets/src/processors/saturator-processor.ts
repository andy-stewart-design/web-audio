const LOG_TWO = Math.LN2;
const NEAR_EQUAL_RELATIVE_TOLERANCE = 1e-5;

interface SaturatorMessage {
  type: "dispose";
}

function isDisposeMessage(message: unknown): message is SaturatorMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "dispose"
  );
}

function parameterValue(
  parameters: Record<string, Float32Array>,
  name: string,
  index: number,
) {
  const values = parameters[name];
  if (!values || values.length === 0) return 1;
  return values.length === 1 ? values[0] : (values[index] ?? values[0]);
}

function stableLogCosh(value: number) {
  const magnitude = Math.abs(value);
  return magnitude + Math.log1p(Math.exp(-2 * magnitude)) - LOG_TWO;
}

function adaaTanh(
  value: number,
  previous: number,
  antiderivative: number,
  previousAntiderivative: number,
) {
  const difference = value - previous;
  const scale = Math.max(1, Math.abs(value), Math.abs(previous));
  if (Math.abs(difference) <= NEAR_EQUAL_RELATIVE_TOLERANCE * scale)
    return Math.tanh((value + previous) / 2);
  return (antiderivative - previousAntiderivative) / difference;
}

class SaturatorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "drive", defaultValue: 1, automationRate: "a-rate" as const },
      {
        name: "postgain",
        defaultValue: 1,
        automationRate: "a-rate" as const,
      },
    ];
  }

  private readonly _previousZ: number[] = [];
  private readonly _previousAntiderivative: number[] = [];
  private _disposed = false;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      if (isDisposeMessage(event.data)) this._disposed = true;
    };
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ) {
    const outputChannels = outputs[0];
    const frameCount = outputChannels?.[0]?.length ?? 0;
    if (!outputChannels || frameCount === 0) return !this._disposed;

    for (const channel of outputChannels) channel.fill(0);
    if (this._disposed) return false;

    const inputChannels = inputs[0] ?? [];
    for (
      let channelIndex = 0;
      channelIndex < outputChannels.length;
      channelIndex++
    ) {
      const output = outputChannels[channelIndex];
      const input = inputChannels[channelIndex];
      let previous = this._previousZ[channelIndex] ?? 0;
      let previousAntiderivative =
        this._previousAntiderivative[channelIndex] ?? 0;

      for (let index = 0; index < frameCount; index++) {
        const inputSample = input?.[index] ?? 0;
        const value = parameterValue(parameters, "drive", index) * inputSample;
        const antiderivative = stableLogCosh(value);
        const shaped = adaaTanh(
          value,
          previous,
          antiderivative,
          previousAntiderivative,
        );
        output[index] = parameterValue(parameters, "postgain", index) * shaped;
        previous = value;
        previousAntiderivative = antiderivative;
      }

      this._previousZ[channelIndex] = previous;
      this._previousAntiderivative[channelIndex] = previousAntiderivative;
    }

    return true;
  }
}

registerProcessor("saturator-processor", SaturatorProcessor);

import { beforeEach, describe, expect, it } from "vitest";
import "../saturator-processor";

interface SaturatorProcessor {
  port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

type SaturatorProcessorConstructor = new () => SaturatorProcessor;
type ParameterValue = number | number[];

type TestRuntime = typeof globalThis & {
  __registeredProcessors: Map<string, unknown>;
  __workletMessages: unknown[];
  currentFrame: number;
  sampleRate: number;
};

const runtime = globalThis as TestRuntime;
const SaturatorProcessor = runtime.__registeredProcessors.get(
  "saturator-processor",
) as SaturatorProcessorConstructor;

function createProcessor() {
  return new SaturatorProcessor();
}

function parameter(value: ParameterValue) {
  return new Float32Array(Array.isArray(value) ? value : [value]);
}

function render(
  processor: SaturatorProcessor,
  input: number[][],
  drive: ParameterValue = 1,
  postgain: ParameterValue = 1,
) {
  const frameCount = input[0]?.length ?? 0;
  const inputs = [input.map((channel) => Float32Array.from(channel))];
  const outputs = [input.map(() => new Float32Array(frameCount))];
  const alive = processor.process(inputs, outputs, {
    drive: parameter(drive),
    postgain: parameter(postgain),
  });
  return { alive, outputs: outputs[0] };
}

function renderBlocks(
  processor: SaturatorProcessor,
  input: number[][],
  blocks: number[],
  drive: ParameterValue = 1,
  postgain: ParameterValue = 1,
) {
  const output = input.map(() => [] as number[]);
  let offset = 0;
  for (const blockSize of blocks) {
    const blockInput = input.map((channel) =>
      channel.slice(offset, offset + blockSize),
    );
    const blockDrive = Array.isArray(drive)
      ? drive.slice(offset, offset + blockSize)
      : drive;
    const blockPostgain = Array.isArray(postgain)
      ? postgain.slice(offset, offset + blockSize)
      : postgain;
    const block = render(processor, blockInput, blockDrive, blockPostgain);
    block.outputs.forEach((channel, channelIndex) =>
      output[channelIndex].push(...channel),
    );
    offset += blockSize;
  }
  return output;
}

function independentlyIntegratedTanh(previous: number, value: number) {
  if (previous === value) return Math.tanh(value);

  const intervalCount = 1_024;
  const step = (value - previous) / intervalCount;
  let sum = Math.tanh(previous) + Math.tanh(value);
  for (let index = 1; index < intervalCount; index++) {
    sum += (index % 2 === 0 ? 2 : 4) * Math.tanh(previous + index * step);
  }
  return (sum * step) / 3 / (value - previous);
}

function expectFinite(values: ArrayLike<number>) {
  expect(Array.from(values).every(Number.isFinite)).toBe(true);
}

beforeEach(() => {
  runtime.currentFrame = 0;
  runtime.sampleRate = 48_000;
  runtime.__workletMessages.length = 0;
});

describe("SaturatorProcessor", () => {
  it("applies independent first-order ADAA samples from zero history", () => {
    const input = [0, 0.25, 0.25, -0.25, 0.75];
    const output = render(createProcessor(), [input]).outputs[0];
    const expected = input.map((sample, index) => {
      const previous = index === 0 ? 0 : input[index - 1];
      return independentlyIntegratedTanh(previous, sample);
    });

    expect(Array.from(output)).toEqual(
      expected.map((value) => expect.closeTo(value, 6)),
    );
  });

  it("uses distinct Float32 samples on both sides of the near-equality threshold", () => {
    const input = [0.9, 0.9000089168548584, 0.90002, 0.9, -0.9];
    const quantized = Array.from(Float32Array.from(input));
    const output = render(createProcessor(), [input]).outputs[0];

    expect(quantized[0]).not.toBe(quantized[1]);
    expect(quantized[1]).not.toBe(quantized[2]);
    expect(Math.abs(quantized[1] - quantized[0])).toBeLessThan(1e-5);
    expect(Math.abs(quantized[2] - quantized[1])).toBeGreaterThan(1e-5);
    expect(output[1]).toBeCloseTo(
      Math.tanh((quantized[0] + quantized[1]) / 2),
      6,
    );
    expect(output[2]).toBeCloseTo(
      independentlyIntegratedTanh(quantized[1], quantized[2]),
      6,
    );
    expect(output[3]).toBeCloseTo(
      independentlyIntegratedTanh(quantized[2], quantized[3]),
      6,
    );
    expect(output[4]).toBeCloseTo(0, 5);
  });

  it("remains finite for useful and genuinely large finite drive", () => {
    const input = [0.9, 0.9000089168548584, 0.90002, 0.9, -0.9];
    const useful = render(createProcessor(), [input], 40).outputs[0];
    const large = render(createProcessor(), [[1, -1, 0.5, -0.5]], 1e30)
      .outputs[0];

    expectFinite(useful);
    expect(useful[1]).toBeCloseTo(Math.tanh(36), 6);
    expect(useful[2]).toBeCloseTo(Math.tanh(36.0008), 6);
    expect(useful[4]).toBeCloseTo(0, 5);
    expectFinite(large);
    expect(large[0]).toBeCloseTo(1, 6);
    expect(large[1]).toBeCloseTo(0, 6);
  });

  it("keeps signed controls, mute history, and zero-drive transitions", () => {
    const processor = createProcessor();
    const first = render(processor, [[0.25, 0.5]], -2, 1).outputs[0];
    const muted = render(processor, [[0.5, 0.5]], 2, 0).outputs[0];
    const unmuted = render(processor, [[0.5]], 2, -1).outputs[0];
    const zeroDrive = render(processor, [[0.5, 0.5]], 0, 1).outputs[0];

    expect(first[0]).toBeLessThan(0);
    expect(muted.every((value) => value === 0)).toBe(true);
    expect(unmuted[0]).toBeLessThan(0);
    expect(zeroDrive[0]).not.toBe(0);
    expect(zeroDrive[1]).toBeCloseTo(0, 6);
  });

  it("keeps channel histories independent and preserves block invariance", () => {
    const input = [
      [0, 0.2, 0.4, 0.1, -0.3, 0.5],
      [0, -0.4, -0.2, 0.6, 0.2, -0.1],
    ];
    const drive = [1, 2, 0.5, -1, 3, 0];
    const postgain = [1, 0.5, 1, 1, 0, 2];
    const continuous = render(
      createProcessor(),
      input,
      drive,
      postgain,
    ).outputs;
    const partitioned = renderBlocks(
      createProcessor(),
      input,
      [1, 2, 3],
      drive,
      postgain,
    );
    const swapped = render(
      createProcessor(),
      [input[1], input[0]],
      drive,
      postgain,
    ).outputs;

    expect(partitioned.map((channel) => [...channel])).toEqual(
      continuous.map((channel) => [...channel]),
    );
    expect(swapped[0]).toEqual(continuous[1]);
    expect(swapped[1]).toEqual(continuous[0]);
    expect(continuous[0]).not.toEqual(continuous[1]);
  });

  it.each([44_100, 48_000])(
    "supports scalar and sample-varying a-rate controls at %i Hz",
    (sampleRate) => {
      runtime.sampleRate = sampleRate;
      const input = [[0.1, 0.2, 0.3, 0.4]];
      const scalar = render(createProcessor(), input, 2, 0.5).outputs[0];
      const varying = render(
        createProcessor(),
        input,
        [1, 2, 3, 4],
        [1, 0.5, -1, 0],
      ).outputs[0];

      expectFinite(scalar);
      expectFinite(varying);
      expect(scalar[0]).toBeGreaterThan(0);
      expect(varying[2]).toBeLessThan(0);
      expect(varying[3]).toBe(0);
    },
  );

  it("stops at explicit disposal instead of treating silence as disposal", () => {
    const processor = createProcessor();
    const silent = render(processor, [[0, 0, 0]]);
    expect(silent.alive).toBe(true);

    processor.port.onmessage?.({ data: { type: "dispose" } } as MessageEvent);
    const disposed = render(processor, [[0.5, 0.5]]);

    expect(disposed.alive).toBe(false);
    expect(disposed.outputs[0].every((value) => value === 0)).toBe(true);
  });
});

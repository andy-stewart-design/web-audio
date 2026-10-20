import { beforeEach, describe, expect, it } from "vitest";
import "../noise-processor";

interface NoiseProcessorOptions {
  processorOptions?: {
    color?: string;
    seed?: number;
    startFrame?: number;
    stopFrame?: number;
  };
}

interface NoiseProcessor {
  port: MessagePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

type NoiseProcessorConstructor = new (
  options?: NoiseProcessorOptions,
) => NoiseProcessor;

type TestRuntime = typeof globalThis & {
  __registeredProcessors: Map<string, unknown>;
  __workletMessages: unknown[];
  currentFrame: number;
  sampleRate: number;
};

const runtime = globalThis as TestRuntime;
const NoiseProcessor = runtime.__registeredProcessors.get(
  "noise-processor",
) as NoiseProcessorConstructor;

function createProcessor(
  options: NoiseProcessorOptions["processorOptions"] = {},
) {
  return new NoiseProcessor({ processorOptions: options });
}

function send(processor: NoiseProcessor, message: unknown) {
  processor.port.onmessage?.({ data: message } as MessageEvent);
}

function render(processor: NoiseProcessor, frame: number, frameCount = 256) {
  runtime.currentFrame = frame;
  const output = new Float32Array(frameCount);
  const alive = processor.process([], [[output]]);
  return { alive, output };
}

function renderBlocks(
  processor: NoiseProcessor,
  blocks: number[],
  startFrame = 0,
) {
  let frame = startFrame;
  const output: number[] = [];
  for (const frameCount of blocks) {
    output.push(...render(processor, frame, frameCount).output);
    frame += frameCount;
  }
  return output;
}

function mean(values: ArrayLike<number>) {
  let sum = 0;
  for (let index = 0; index < values.length; index++) sum += values[index];
  return sum / values.length;
}

function rms(values: ArrayLike<number>) {
  let sum = 0;
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    sum += value * value;
  }
  return Math.sqrt(sum / values.length);
}

function goertzelPower(
  values: ArrayLike<number>,
  frequency: number,
  sampleRate: number,
) {
  const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
  let previous = 0;
  let previousPrevious = 0;
  for (let index = 0; index < values.length; index++) {
    const window =
      0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (values.length - 1));
    const current =
      values[index] * window + coefficient * previous - previousPrevious;
    previousPrevious = previous;
    previous = current;
  }
  return (
    previous * previous +
    previousPrevious * previousPrevious -
    coefficient * previous * previousPrevious
  );
}

function octavePower(
  values: ArrayLike<number>,
  centerFrequency: number,
  sampleRate: number,
) {
  const powers = [-2, -1, 0, 1, 2].map((offset) =>
    goertzelPower(values, centerFrequency * 2 ** (offset / 12), sampleRate),
  );
  return powers.reduce((sum, value) => sum + value, 0) / powers.length;
}

function spectralSlope(values: ArrayLike<number>, sampleRate: number) {
  const frequencies = [125, 250, 500, 1000, 2000, 4000, 8000];
  const powers = frequencies.map(
    (frequency) => 10 * Math.log10(octavePower(values, frequency, sampleRate)),
  );
  const meanX = mean(frequencies.map(Math.log2));
  const meanY = mean(powers);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < frequencies.length; index++) {
    const x = Math.log2(frequencies[index]) - meanX;
    numerator += x * (powers[index] - meanY);
    denominator += x * x;
  }
  return numerator / denominator;
}

function expectFinite(values: ArrayLike<number>) {
  expect(
    Array.from({ length: values.length }, (_, index) => values[index]).every(
      Number.isFinite,
    ),
  ).toBe(true);
}

function collectLongRun(
  color: "white" | "pink",
  seconds: number,
  sampleRate: number,
  seed = 0x12345678,
) {
  const processor = createProcessor({
    color,
    seed,
    startFrame: 0,
    stopFrame: seconds * sampleRate,
  });
  const output: number[] = [];
  let frame = 0;
  while (frame < seconds * sampleRate) {
    const frameCount = Math.min(256, seconds * sampleRate - frame);
    output.push(...render(processor, frame, frameCount).output);
    frame += frameCount;
  }
  return output;
}

beforeEach(() => {
  runtime.currentFrame = 0;
  runtime.__workletMessages.length = 0;
  runtime.sampleRate = 48000;
});

describe("NoiseProcessor", () => {
  it("gates output at exact sample boundaries and completes once", () => {
    const processor = createProcessor({
      seed: 13,
      startFrame: 5,
      stopFrame: 12,
    });

    const output = render(processor, 0, 16);

    expect(output.alive).toBe(false);
    expect(
      Array.from(output.output.slice(0, 5)).every((value) => value === 0),
    ).toBe(true);
    expect(
      Array.from(output.output.slice(5, 12)).some((value) => value !== 0),
    ).toBe(true);
    expect(
      Array.from(output.output.slice(12)).every((value) => value === 0),
    ).toBe(true);
    expect(runtime.__workletMessages).toEqual([{ type: "ended" }]);

    expect(render(processor, 16, 16).alive).toBe(false);
    expect(runtime.__workletMessages).toEqual([{ type: "ended" }]);
  });

  it("cancels a future voice before its start", () => {
    const processor = createProcessor();
    send(processor, { type: "start", frame: 100 });
    send(processor, { type: "stop", frame: 50 });

    const output = render(processor, 0, 128);

    expect(output.alive).toBe(false);
    expectFinite(output.output);
    expect(output.output.every((value) => value === 0)).toBe(true);
    expect(runtime.__workletMessages).toEqual([{ type: "ended" }]);
  });

  it("cancels immediately without waiting for a scheduled frame", () => {
    const processor = createProcessor({ startFrame: 0, stopFrame: 100_000 });
    send(processor, { type: "cancel" });

    const output = render(processor, 0, 128);

    expect(output.alive).toBe(false);
    expectFinite(output.output);
    expect(output.output.every((value) => value === 0)).toBe(true);
    expect(runtime.__workletMessages).toEqual([{ type: "ended" }]);
  });

  it("ignores malformed options and control messages", () => {
    const processor = createProcessor({
      color: "blue",
      seed: Number.NaN,
      startFrame: Number.NaN,
      stopFrame: Number.NaN,
    });

    expect(() => {
      send(processor, null);
      send(processor, { type: "start" });
      send(processor, { type: "stop", frame: Number.NaN });
      send(processor, { type: "unknown", frame: 10 });
      render(processor, 0, 128);
    }).not.toThrow();
    expectFinite(render(processor, 128, 128).output);
  });

  it("preserves state across arbitrary processing block partitions", () => {
    const options = {
      color: "pink" as const,
      seed: 0xabcdef,
      startFrame: 0,
    };
    const oneBlock = renderBlocks(createProcessor(options), [4096]);
    const partitioned = renderBlocks(
      createProcessor(options),
      [37, 511, 13, 1024, 89, 2422],
    );

    expect(partitioned).toEqual(oneBlock);
  });

  it("repeats a seeded stream and varies distinct seeds", () => {
    const first = renderBlocks(
      createProcessor({ seed: 123, startFrame: 0 }),
      [1024],
    );
    const same = renderBlocks(
      createProcessor({ seed: 123, startFrame: 0 }),
      [1024],
    );
    const different = renderBlocks(
      createProcessor({ seed: 124, startFrame: 0 }),
      [1024],
    );

    expect(first).toEqual(same);
    expect(first).not.toEqual(different);
  });

  it.each([44100, 48000, 96000])(
    "characterizes finite white and pink output at %i Hz across seeds",
    (sampleRate) => {
      runtime.sampleRate = sampleRate;
      const seeds = [1, 0x12345678, 0xdeadbeef];
      const whiteRuns = seeds.map((seed) =>
        collectLongRun("white", 10, sampleRate, seed).slice(2 * sampleRate),
      );
      const pinkRuns = seeds.map((seed) =>
        collectLongRun("pink", 10, sampleRate, seed).slice(2 * sampleRate),
      );

      for (const values of [...whiteRuns, ...pinkRuns]) {
        expectFinite(values);
        expect(rms(values)).toBeGreaterThan(0);
        expect(Math.abs(mean(values)) / rms(values)).toBeLessThan(0.05);
      }

      const whiteSlopes = whiteRuns.map((values) =>
        spectralSlope(values, sampleRate),
      );
      const pinkSlopes = pinkRuns.map((values) =>
        spectralSlope(values, sampleRate),
      );
      const average = (values: number[]) =>
        values.reduce((sum, value) => sum + value, 0) / values.length;
      const averageWhiteRms = average(whiteRuns.map(rms));
      const averagePinkRms = average(pinkRuns.map(rms));

      expect(Math.abs(average(whiteSlopes))).toBeLessThan(0.5);
      expect(average(pinkSlopes)).toBeCloseTo(-3, 0);
      expect(averageWhiteRms).toBeGreaterThan((1 / Math.sqrt(3)) * 0.97);
      expect(averageWhiteRms).toBeLessThan((1 / Math.sqrt(3)) * 1.03);
      expect(averagePinkRms / averageWhiteRms).toBeGreaterThan(0.9);
      expect(averagePinkRms / averageWhiteRms).toBeLessThan(1.1);
    },
  );
});

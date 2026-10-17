import { beforeEach, describe, expect, it } from "vitest";
import "../supersaw-processor";

interface SupersawProcessorOptions {
  processorOptions?: {
    voices?: number;
    phaseSeed?: number;
    startFrame?: number;
    stopFrame?: number;
  };
}

interface SupersawProcessor {
  port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

type SupersawProcessorConstructor = new (
  options?: SupersawProcessorOptions,
) => SupersawProcessor;
type ParameterInput = number | number[];

type TestRuntime = typeof globalThis & {
  __registeredProcessors: Map<string, unknown>;
  __workletMessages: unknown[];
  currentFrame: number;
};

const runtime = globalThis as TestRuntime;
const SupersawProcessor = runtime.__registeredProcessors.get(
  "supersaw-processor",
) as SupersawProcessorConstructor;

function createProcessor(
  options: SupersawProcessorOptions["processorOptions"] = {},
) {
  return new SupersawProcessor({ processorOptions: options });
}

function send(
  processor: SupersawProcessor,
  message: { type: "start" | "stop"; frame: number },
) {
  processor.port.onmessage?.({ data: message } as MessageEvent);
}

function toParameter(value: ParameterInput | undefined, fallback: number) {
  const input = value ?? fallback;
  return new Float32Array(Array.isArray(input) ? input : [input]);
}

function render(
  processor: SupersawProcessor,
  frame: number,
  frameCount = 256,
  values: Partial<
    Record<"frequency" | "detune" | "spread" | "width", ParameterInput>
  > = {},
) {
  runtime.currentFrame = frame;
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  const parameters = {
    frequency: toParameter(values.frequency, 440),
    detune: toParameter(values.detune, 0),
    spread: toParameter(values.spread, 10),
    width: toParameter(values.width, 0.4),
  };
  const alive = processor.process([], [[left, right]], parameters);
  return { alive, left, right };
}

function rms(values: Float32Array) {
  let sum = 0;
  for (const value of values) sum += value * value;
  return Math.sqrt(sum / values.length);
}

function expectFinite(values: Float32Array) {
  expect(Array.from(values).every(Number.isFinite)).toBe(true);
}

beforeEach(() => {
  runtime.currentFrame = 0;
  runtime.__workletMessages.length = 0;
});

describe("SupersawProcessor", () => {
  it.each([1, 2, 7, 8])("renders finite output for %i voices", (voices) => {
    const processor = createProcessor({
      voices,
      phaseSeed: 17,
      startFrame: 0,
    });
    const output = render(processor, 0, 512, {
      spread: 12,
      width: 0.4,
    });

    expect(output.alive).toBe(true);
    expectFinite(output.left);
    expectFinite(output.right);
    expect(rms(output.left)).toBeGreaterThan(0);
    expect(rms(output.right)).toBeGreaterThan(0);
  });

  it("accepts audio-rate frequency, detune, spread, and width", () => {
    const frameCount = 256;
    const output = render(
      createProcessor({ voices: 2, phaseSeed: 19, startFrame: 0 }),
      0,
      frameCount,
      {
        frequency: Array.from(
          { length: frameCount },
          (_, index) => 220 + index,
        ),
        detune: Array.from({ length: frameCount }, (_, index) => index / 4),
        spread: Array.from({ length: frameCount }, (_, index) => index / 16),
        width: Array.from(
          { length: frameCount },
          (_, index) => index / frameCount,
        ),
      },
    );

    expectFinite(output.left);
    expectFinite(output.right);
    expect(rms(output.left)).toBeGreaterThan(0);
    expect(rms(output.right)).toBeGreaterThan(0);
  });

  it("clamps count, spread, and width at the processor boundary", () => {
    const oneVoice = render(
      createProcessor({ voices: 0, phaseSeed: 3, startFrame: 0 }),
      0,
      128,
      { spread: -12, width: 0 },
    );
    const clampedEight = render(
      createProcessor({ voices: 99, phaseSeed: 3, startFrame: 0 }),
      0,
      128,
      { spread: 12, width: 1 },
    );

    expect(oneVoice.left).toEqual(oneVoice.right);
    expectFinite(clampedEight.left);
    expectFinite(clampedEight.right);
  });

  it("uses the ±spread endpoints for a two-voice stack", () => {
    const centered = render(
      createProcessor({ voices: 2, phaseSeed: 5, startFrame: 0 }),
      0,
      1024,
      { spread: 0, width: 0 },
    );
    const detuned = render(
      createProcessor({ voices: 2, phaseSeed: 5, startFrame: 0 }),
      0,
      1024,
      { spread: 12, width: 0 },
    );

    expect(detuned.left).not.toEqual(centered.left);
    expect(detuned.left).toEqual(detuned.right);
  });

  it("does not create a large odd/even panning bias", () => {
    for (const voices of [2, 3, 8, 7]) {
      const output = render(
        createProcessor({ voices, phaseSeed: 29, startFrame: 0 }),
        0,
        16384,
        { spread: 0, width: 1 },
      );
      const leftRms = rms(output.left);
      const rightRms = rms(output.right);
      expect(
        Math.abs(leftRms - rightRms) / Math.max(leftRms, rightRms),
      ).toBeLessThan(0.3);
    }
  });

  it("uses count compensation instead of an unscaled sum", () => {
    const levels = [1, 2, 7, 8].map((voices) =>
      rms(
        render(
          createProcessor({ voices, phaseSeed: 41, startFrame: 0 }),
          0,
          4096,
          { spread: 0, width: 0 },
        ).left,
      ),
    );

    expect(Math.max(...levels) / Math.min(...levels)).toBeLessThan(2);
  });

  it("initializes phases deterministically per seed", () => {
    const first = render(
      createProcessor({ voices: 7, phaseSeed: 123, startFrame: 0 }),
      0,
      512,
    );
    const second = render(
      createProcessor({ voices: 7, phaseSeed: 123, startFrame: 0 }),
      0,
      512,
    );
    const different = render(
      createProcessor({ voices: 7, phaseSeed: 124, startFrame: 0 }),
      0,
      512,
    );

    expect(first.left).toEqual(second.left);
    expect(first.right).toEqual(second.right);
    expect(first.left).not.toEqual(different.left);
  });

  it("clamps high frequencies without wrapping them into a different pitch", () => {
    const nyquist = render(
      createProcessor({ voices: 1, phaseSeed: 7, startFrame: 0 }),
      0,
      256,
      { frequency: 22050 },
    );
    const aboveNyquist = render(
      createProcessor({ voices: 1, phaseSeed: 7, startFrame: 0 }),
      0,
      256,
      { frequency: 40000 },
    );
    const extreme = render(
      createProcessor({ voices: 8, phaseSeed: 7, startFrame: 0 }),
      0,
      256,
      { frequency: 3e38, detune: 3e38, spread: 3e38, width: 3e38 },
    );

    expect(aboveNyquist.left).toEqual(nyquist.left);
    expect(aboveNyquist.right).toEqual(nyquist.right);
    expectFinite(extreme.left);
    expectFinite(extreme.right);
  });

  it("gates start and stop at sample boundaries and completes once", () => {
    const processor = createProcessor({ voices: 2, phaseSeed: 13 });
    send(processor, { type: "start", frame: 5 });
    send(processor, { type: "stop", frame: 12 });

    const output = render(processor, 0, 16);

    expect(output.alive).toBe(false);
    expect(
      Array.from(output.left.slice(0, 5)).every((value) => value === 0),
    ).toBe(true);
    expect(
      Array.from(output.left.slice(5, 12)).some((value) => value !== 0),
    ).toBe(true);
    expect(
      Array.from(output.left.slice(12)).every((value) => value === 0),
    ).toBe(true);
    expect(runtime.__workletMessages).toEqual([{ type: "ended" }]);

    const afterCompletion = render(processor, 16, 16);
    expect(afterCompletion.alive).toBe(false);
    expect(runtime.__workletMessages).toEqual([{ type: "ended" }]);
  });

  it("completes a future voice cancelled before its start", () => {
    const processor = createProcessor({ voices: 2, phaseSeed: 13 });
    send(processor, { type: "start", frame: 100 });
    send(processor, { type: "stop", frame: 50 });

    expect(runtime.__workletMessages).toEqual([{ type: "ended" }]);
    const output = render(processor, 0, 128);
    expect(output.alive).toBe(false);
    expectFinite(output.left);
    expectFinite(output.right);
  });
});

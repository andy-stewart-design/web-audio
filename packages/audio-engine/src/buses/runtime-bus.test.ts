import { describe, expect, it, vi } from "vitest";
import RuntimeBus from "./runtime-bus";

class FakeGainNode {
  gain = { value: 1 };
  connect = vi.fn();
  disconnect = vi.fn();
}

describe("RuntimeBus", () => {
  it("connects input through output gain to main", () => {
    const gains: FakeGainNode[] = [];
    const ctx = {
      createGain: () => {
        const gain = new FakeGainNode();
        gains.push(gain);
        return gain;
      },
    } as unknown as AudioContext;
    const main = new FakeGainNode();
    const bus = new RuntimeBus(
      ctx,
      { gain: 0.75, effects: [] },
      main as unknown as AudioNode,
    );
    const [input, output] = gains;

    expect(bus.input).toBe(input);
    expect(input.connect).toHaveBeenCalledOnce();
    expect(input.connect).toHaveBeenCalledWith(output);
    expect(output.gain.value).toBe(0.75);
    expect(output.connect).toHaveBeenCalledWith(main);
  });

  it("destroys both owned nodes idempotently", () => {
    const gains: FakeGainNode[] = [];
    const ctx = {
      createGain: () => {
        const gain = new FakeGainNode();
        gains.push(gain);
        return gain;
      },
    } as unknown as AudioContext;
    const bus = new RuntimeBus(
      ctx,
      { gain: 1, effects: [] },
      new FakeGainNode() as unknown as AudioNode,
    );

    bus.destroy();
    bus.destroy();

    expect(gains[0].disconnect).toHaveBeenCalledOnce();
    expect(gains[1].disconnect).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it } from "vitest";
import Instrument from "./instrument";

// ---------------------------------------------------------------------------
// Minimal Web Audio fakes — only what Instrument needs
// ---------------------------------------------------------------------------

class FakeSourceNode {
  onended: (() => void) | null = null;
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
  fireEnded() {
    this.onended?.();
  }
}

class FakeGainNode {
  gain = {
    value: 1,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
  };
  connect() {}
  disconnect() {}
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  createGain() {
    return new FakeGainNode();
  }
}

// ---------------------------------------------------------------------------
// Concrete subclass that exposes _track for testing
// ---------------------------------------------------------------------------

class TestInstrument extends Instrument {
  scheduleBar() {}

  track(
    sourceNode: FakeSourceNode,
    audioNodes: FakeGainNode[],
    startTime: number,
  ) {
    this._track(
      sourceNode as unknown as AudioScheduledSourceNode,
      audioNodes as unknown as AudioNode[],
      startTime,
    );
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Instrument.done", () => {
  it("resolves after all scheduled notes fire onended", async () => {
    const ctx = new FakeAudioContext();
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
    );

    const node1 = new FakeSourceNode();
    const node2 = new FakeSourceNode();
    instrument.track(node1, [], 0);
    instrument.track(node2, [], 0);

    // Fire first node — done should not resolve yet
    node1.fireEnded();
    let resolved = false;
    instrument.done.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Fire second node — done should now resolve
    node2.fireEnded();
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it("resolves when cancelFutureNotes drains all scheduled notes", async () => {
    const ctx = new FakeAudioContext();
    ctx.currentTime = 0;
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
    );

    const node = new FakeSourceNode();
    instrument.track(node, [], 1); // startTime=1 > currentTime=0

    instrument.cancelFutureNotes();

    let resolved = false;
    instrument.done.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it("fires .then() registered after resolution in the next microtask", async () => {
    const ctx = new FakeAudioContext();
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
    );

    // No notes scheduled — cancelFutureNotes resolves immediately
    instrument.cancelFutureNotes();

    // Attach .then() after the promise has already settled
    let resolved = false;
    instrument.done.then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false); // microtask hasn't run yet
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it("fires multiple .then() registrations when done resolves", async () => {
    const ctx = new FakeAudioContext();
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
    );

    const node = new FakeSourceNode();
    instrument.track(node, [], 0);

    const calls: number[] = [];
    instrument.done.then(() => calls.push(1));
    instrument.done.then(() => calls.push(2));
    instrument.done.then(() => calls.push(3));

    node.fireEnded();
    await Promise.resolve();
    expect(calls).toEqual([1, 2, 3]);
  });
});

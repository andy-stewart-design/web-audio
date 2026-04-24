import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClockEventCallback, ClockEventType } from "@web-audio/clock";
import type { DromeSchema } from "@web-audio/schema";

// Mock Synthesizer so tests don't need Web Audio APIs.
// Must use a regular function (not arrow) so it's usable as a constructor.
vi.mock("./synthesizer", () => {
  function MockSynthesizer(this: Record<string, unknown>) {
    this.scheduleBar = vi.fn();
    this.cancelFutureNotes = vi.fn();
    this.whenDone = vi.fn();
  }
  return { default: vi.fn(MockSynthesizer) };
});

import AudioEngine from "./index";
import MockSynthesizer from "./synthesizer";

// Controllable clock stub — lets tests fire events manually
class FakeClock {
  paused = true;
  barDuration = 2;
  private _listeners = new Map<ClockEventType, Set<ClockEventCallback>>();

  on(type: ClockEventType, fn: ClockEventCallback): () => void {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type)!.add(fn);
    return () => this._listeners.get(type)?.delete(fn);
  }

  emit(type: ClockEventType, bar = 0, time = 0) {
    this._listeners.get(type)?.forEach((cb) => cb({ beat: 0, bar }, time));
  }
}

// Minimal schema fixture — Synthesizer is mocked so instruments don't need to
// be valid; only the array length matters for player creation.
function makeSchema(instrumentCount = 1): DromeSchema {
  return {
    instruments: Array.from({ length: instrumentCount }, () => ({}) as never),
  };
}

function instances() {
  return vi.mocked(MockSynthesizer).mock.instances as unknown as Array<{
    scheduleBar: ReturnType<typeof vi.fn>;
    cancelFutureNotes: ReturnType<typeof vi.fn>;
    whenDone: ReturnType<typeof vi.fn>;
  }>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AudioEngine", () => {
  describe("update() with paused clock", () => {
    it("commits immediately when the clock is paused", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine({} as AudioContext, clock as never);

      engine.update(makeSchema());
      clock.emit("bar");

      expect(instances()[0].scheduleBar).toHaveBeenCalledOnce();
    });

    it("last update wins when called multiple times while paused", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine({} as AudioContext, clock as never);

      engine.update(makeSchema(1)); // committed immediately → player[0]
      engine.update(makeSchema(1)); // committed immediately → player[1], player[0] retires
      clock.emit("bar");

      const all = instances();
      expect(all).toHaveLength(2);
      // Only the most-recently committed player schedules audio
      expect(all[0].scheduleBar).not.toHaveBeenCalled();
      expect(all[1].scheduleBar).toHaveBeenCalledOnce();
    });
  });

  describe("update() with running clock (last-write-wins before prebar)", () => {
    it("defers commit until prebar fires", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine({} as AudioContext, clock as never);

      engine.update(makeSchema());
      clock.emit("bar"); // no commit yet — prebar hasn't fired

      expect(instances()).toHaveLength(0);
    });

    it("commits on prebar and schedules on the subsequent bar", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine({} as AudioContext, clock as never);

      engine.update(makeSchema());
      clock.emit("prebar"); // _commit() fires
      expect(instances()).toHaveLength(1);
      expect(instances()[0].scheduleBar).not.toHaveBeenCalled();

      clock.emit("bar");
      expect(instances()[0].scheduleBar).toHaveBeenCalledOnce();
    });

    it("only the last schema is committed when update() is called twice before prebar", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine({} as AudioContext, clock as never);

      engine.update(makeSchema(1)); // pending = schema1
      engine.update(makeSchema(1)); // pending = schema2 (schema1 discarded)
      clock.emit("prebar");         // commits schema2 only → 1 player created

      expect(instances()).toHaveLength(1);

      clock.emit("bar");
      expect(instances()[0].scheduleBar).toHaveBeenCalledOnce();
    });

    it("multi-instrument schema creates one player per instrument", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine({} as AudioContext, clock as never);

      engine.update(makeSchema(3));
      clock.emit("prebar");
      clock.emit("bar");

      expect(instances()).toHaveLength(3);
      instances().forEach((p) => expect(p.scheduleBar).toHaveBeenCalledOnce());
    });
  });

  describe("prebar → bar hot-swap window", () => {
    it("players exist after prebar but have no scheduled audio until bar fires", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine({} as AudioContext, clock as never);

      engine.update(makeSchema());
      clock.emit("prebar");

      expect(instances()).toHaveLength(1);
      expect(instances()[0].scheduleBar).not.toHaveBeenCalled();
    });

    it("bar passes its index to scheduleBar", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine({} as AudioContext, clock as never);

      engine.update(makeSchema());
      clock.emit("prebar");
      clock.emit("bar", 5, 10);

      expect(instances()[0].scheduleBar).toHaveBeenCalledWith(5, 10);
    });
  });

  describe("retirement", () => {
    it("registers old players for retirement on hot-swap", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine({} as AudioContext, clock as never);

      engine.update(makeSchema(1));
      clock.emit("prebar"); // player[0] created

      engine.update(makeSchema(1));
      clock.emit("prebar"); // player[0] retired, player[1] created

      expect(instances()[0].whenDone).toHaveBeenCalledOnce();
      expect(instances()[1].whenDone).not.toHaveBeenCalled();
    });

    it("invokes whenDone callback to remove the player from the retiring set", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine({} as AudioContext, clock as never);

      engine.update(makeSchema());
      clock.emit("prebar"); // player[0] created

      engine.update(makeSchema());
      clock.emit("prebar"); // player[0] retired → whenDone registered

      // Simulate player[0] finishing its tail — invoke the registered callback
      const retireCallback = instances()[0].whenDone.mock.calls[0][0] as () => void;
      expect(() => retireCallback()).not.toThrow();
    });
  });

  describe("stop event", () => {
    it("cancels future notes on all active players", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine({} as AudioContext, clock as never);

      engine.update(makeSchema(2));
      clock.emit("prebar");
      clock.emit("stop");

      instances().forEach((p) =>
        expect(p.cancelFutureNotes).toHaveBeenCalledOnce(),
      );
    });
  });

  describe("destroy()", () => {
    it("unsubscribes from clock events so subsequent events have no effect", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine({} as AudioContext, clock as never);

      engine.update(makeSchema());
      clock.emit("prebar");
      engine.destroy();

      // After destroy, bar events must not call scheduleBar
      clock.emit("bar");
      expect(instances()[0].scheduleBar).not.toHaveBeenCalled();
    });
  });
});

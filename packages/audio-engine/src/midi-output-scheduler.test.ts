import { describe, expect, test, vi } from "vitest";
import type { Midi, ResolvedMidiOutput } from "@web-audio/midi";
import MidiOutputScheduler, { type LogicalNote } from "./midi-output-scheduler";

const createHarness = () => {
  let currentTime = 0;
  let nextTimer = 0;
  const timers = new Map<number, { time: number; callback: () => void }>();
  const handles = new Map<string, ResolvedMidiOutput>();
  const resolve = vi.fn((selector?: string) => {
    const id = selector ?? "default";
    let handle = handles.get(id);
    if (!handle) {
      handle = Object.freeze({ id });
      handles.set(id, handle);
    }
    return handle;
  });
  const noteOn = vi.fn((output: ResolvedMidiOutput, options: unknown) => {
    void output;
    void options;
    return { sent: true } as const;
  });
  const noteOff = vi.fn((output: ResolvedMidiOutput, options: unknown) => {
    void output;
    void options;
    return { sent: true } as const;
  });
  const cc = vi.fn((output: ResolvedMidiOutput, options: unknown) => {
    void output;
    void options;
    return { sent: true } as const;
  });
  const clear = vi.fn((output: ResolvedMidiOutput) => {
    void output;
  });
  const midi = {
    out: { resolve, noteOn, noteOff, cc, clear },
  } as unknown as Midi;

  const clock = {
    ctx: {
      get currentTime() {
        return currentTime;
      },
    },
    schedulingLeadTime: 0.1,
    schedulingInterval: 0.025,
    audioTimeToMIDITime: (time: number) => time * 1000,
  };
  const scheduler = new MidiOutputScheduler(clock, {
    scheduleTimer: (callback, delay) => {
      const id = nextTimer++;
      timers.set(id, { time: currentTime + delay / 1000, callback });
      return () => timers.delete(id);
    },
  });

  const advanceTo = (time: number) => {
    currentTime = time;
    while (true) {
      const ready = Array.from(timers.entries())
        .filter(([, timer]) => timer.time <= currentTime)
        .sort((a, b) => a[1].time - b[1].time || a[0] - b[0]);
      const next = ready[0];
      if (!next) return;
      timers.delete(next[0]);
      next[1].callback();
    }
  };

  return {
    scheduler,
    midi,
    timers,
    resolve,
    noteOn,
    noteOff,
    cc,
    clear,
    advanceTo,
    setCurrentTime: (time: number) => {
      currentTime = time;
    },
  };
};

const note = (overrides: Partial<LogicalNote> = {}) => ({
  channel: 1,
  note: 60,
  velocity: 100,
  startTime: 1,
  endTime: 2,
  ...overrides,
});

describe("MidiOutputScheduler timing", () => {
  test("rejects a horizon that violates the clock lead invariant", () => {
    expect(
      () =>
        new MidiOutputScheduler({
          ctx: { currentTime: 0 },
          schedulingLeadTime: 0.07,
          schedulingInterval: 0.025,
          audioTimeToMIDITime: (time) => time,
        }),
    ).toThrow("must be shorter");
  });

  test("dispatches only when an event enters the rolling horizon", () => {
    const harness = createHarness();
    harness.scheduler.connect(harness.midi);
    harness.scheduler.scheduleNote(note());

    harness.advanceTo(0.94);
    expect(harness.noteOn).not.toHaveBeenCalled();

    harness.advanceTo(0.95);
    expect(harness.noteOn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "default" }),
      { note: 60, velocity: 100, channel: 1, time: 1000 },
    );
  });

  test("deliberately timestamps late events at the current time", () => {
    const harness = createHarness();
    harness.scheduler.connect(harness.midi);
    harness.setCurrentTime(1);

    harness.scheduler.scheduleNote(note({ startTime: 0.5, endTime: 2 }));
    harness.advanceTo(1);

    expect(harness.noteOn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ time: 1000 }),
    );
  });

  test("preserves next-bar ordering under the maximum expected timer delay", () => {
    const harness = createHarness();
    harness.scheduler.connect(harness.midi);
    harness.scheduler.scheduleNote(note({ startTime: 1, endTime: 2 }));
    harness.advanceTo(0.95);

    // The next bar is exposed with 100ms lead, before the 50ms MIDI horizon.
    harness.setCurrentTime(1.9);
    harness.scheduler.scheduleNote(
      note({ note: 61, startTime: 2, endTime: 3 }),
    );
    // Dispatch runs 25ms after its nominal 1.95s wake-up.
    harness.advanceTo(1.975);

    expect(harness.noteOff.mock.invocationCallOrder[0]).toBeLessThan(
      harness.noteOn.mock.invocationCallOrder[1],
    );
  });

  test("orders note-off before note-on at equal timestamps", () => {
    const harness = createHarness();
    harness.scheduler.connect(harness.midi);
    harness.scheduler.scheduleNote(note({ startTime: 1, endTime: 2 }));
    harness.scheduler.scheduleNote(
      note({ note: 61, startTime: 2, endTime: 3 }),
    );
    harness.advanceTo(0.95);
    harness.advanceTo(1.95);

    expect(harness.noteOff).toHaveBeenCalledOnce();
    expect(harness.noteOn).toHaveBeenCalledTimes(2);
    expect(harness.noteOff.mock.invocationCallOrder[0]).toBeLessThan(
      harness.noteOn.mock.invocationCallOrder[1],
    );
  });
});

describe("MidiOutputScheduler lifecycle", () => {
  test("retains the concrete note-on output for note-off", () => {
    const harness = createHarness();
    harness.scheduler.connect(harness.midi);
    harness.scheduler.scheduleNote(note({ selector: "hardware" }));
    harness.advanceTo(0.95);
    const output = harness.noteOn.mock.calls[0][0];
    harness.advanceTo(1.95);

    expect(harness.noteOff.mock.calls[0][0]).toBe(output);
  });

  test("stop clears queues, sends All Notes Off, and discards logical events", () => {
    const harness = createHarness();
    harness.scheduler.connect(harness.midi);
    harness.scheduler.scheduleNote(note());
    harness.advanceTo(0.95);

    harness.scheduler.stop();

    expect(harness.clear).toHaveBeenCalledOnce();
    expect(harness.cc).toHaveBeenCalledWith(expect.anything(), {
      cc: 123,
      value: 0,
      channel: 1,
      time: 950,
    });
    expect(harness.timers.size).toBe(0);
    harness.advanceTo(3);
    expect(harness.noteOff).not.toHaveBeenCalled();
  });

  test("replacement discards the old generation and cleans the old MIDI instance", () => {
    const harness = createHarness();
    const replacement = createHarness();
    harness.scheduler.connect(harness.midi);
    harness.scheduler.scheduleNote(note());
    harness.advanceTo(0.95);

    harness.scheduler.connect(replacement.midi);

    expect(harness.clear).toHaveBeenCalledOnce();
    harness.advanceTo(3);
    expect(harness.noteOff).not.toHaveBeenCalled();
  });

  test("destroy is terminal", () => {
    const harness = createHarness();
    harness.scheduler.connect(harness.midi);
    harness.scheduler.scheduleNote(note());

    harness.scheduler.destroy();
    harness.scheduler.scheduleNote(note({ startTime: 3, endTime: 4 }));
    harness.advanceTo(5);

    expect(harness.noteOn).not.toHaveBeenCalled();
    expect(harness.timers.size).toBe(0);
  });
});

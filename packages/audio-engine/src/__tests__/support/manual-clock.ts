import type { EngineClock } from "../../index";

type ClockEvent = Parameters<EngineClock["on"]>[0];
type ClockCallback = Parameters<EngineClock["on"]>[1];

// Test-only manual events, not another real-time scheduler or an audio renderer.
export function createManualClock(
  ctx: EngineClock["ctx"] = { currentTime: 0 },
) {
  let tempo = 140;
  const listeners = new Map<ClockEvent, Set<ClockCallback>>();
  const clock = {
    ctx,
    schedulingLeadTime: 0.1,
    schedulingInterval: 0.025,
    audioTimeToMIDITime: (time: number) => time * 1000,
    get barDuration() {
      return (60 / tempo) * 4;
    },
    bpm(value: number) {
      if (value > 0) tempo = value;
    },
    on(type: ClockEvent, callback: ClockCallback) {
      let group = listeners.get(type);
      if (!group) {
        group = new Set();
        listeners.set(type, group);
      }
      group.add(callback);
      return () => {
        group.delete(callback);
      };
    },
  } satisfies EngineClock;

  return {
    clock,
    emit(type: ClockEvent, bar = 0, time = 0) {
      listeners
        .get(type)
        ?.forEach((callback) =>
          callback({ beat: 0, bar }, time, clock.barDuration),
        );
    },
    listenerCount: () =>
      Array.from(listeners.values()).reduce(
        (count, group) => count + group.size,
        0,
      ),
  };
}

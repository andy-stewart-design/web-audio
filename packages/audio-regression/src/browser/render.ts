import AudioEngine, { type EngineClock } from "@web-audio/audio-engine";
import { evaluateSource } from "@web-audio/fluid";
import { normalizeCase, planRender } from "../cases";

type ClockEvent = Parameters<EngineClock["on"]>[0];
type ClockCallback = Parameters<EngineClock["on"]>[1];

function createOfflineClock(ctx: OfflineAudioContext, beatsPerBar: number) {
  let tempo = 120;
  const listeners = new Map<ClockEvent, Set<ClockCallback>>();
  const clock = {
    ctx,
    schedulingLeadTime: 0.1,
    schedulingInterval: 0.025,
    audioTimeToMIDITime: (time: number) => time * 1000,
    get barDuration() {
      return (60 / tempo) * beatsPerBar;
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
    emit(type: ClockEvent, bar: number, time: number) {
      listeners
        .get(type)
        ?.forEach((callback) =>
          callback({ beat: 0, bar }, time, clock.barDuration),
        );
    },
  };
}

async function renderSketch(
  sketch: ReturnType<typeof normalizeCase>,
  resourceUrls: Record<string, string>,
) {
  const schema = evaluateSource(sketch.code);
  const localUrls = new Map(Object.entries(resourceUrls));
  // Only explicitly mapped sample URLs change; no production resolver is replaced.
  for (const bank of Object.values(schema.banks)) {
    for (const sources of Object.values(bank.samples)) {
      for (const variations of Object.values(sources)) {
        for (const entry of variations) {
          const local = localUrls.get(entry.src);
          if (local) entry.src = local;
        }
      }
    }
  }
  for (const instrument of schema.instruments) {
    if ("notesOut" in instrument && instrument.notesOut)
      throw new Error("Offline fixtures must not author MIDI output");
  }
  const layout = planRender(sketch, schema.bpm ?? 120);
  const ctx = new OfflineAudioContext({
    numberOfChannels: sketch.settings.channels,
    length: layout.frameCount,
    sampleRate: sketch.settings.sampleRate,
  });
  const driver = createOfflineClock(ctx, sketch.settings.beatsPerBar);
  const engine = new AudioEngine(ctx, driver.clock);
  try {
    await engine.ready;
    engine.update(schema);
    await engine.prepare();
    driver.emit("prebar", 0, layout.startTime);
    for (let bar = 0; bar < sketch.bars; bar++) {
      driver.emit(
        "bar",
        bar,
        layout.startTime + bar * driver.clock.barDuration,
      );
    }
    const buffer = await ctx.startRendering();
    // JS numbers exactly represent every Float32 sample. Node reconstructs
    // Float32Arrays without quantization, gain changes, or resampling.
    const channels = Array.from(
      { length: buffer.numberOfChannels },
      (_, channel) => Array.from(buffer.getChannelData(channel)),
    );
    return {
      id: sketch.id,
      settings: sketch.settings,
      bars: sketch.bars,
      tailSeconds: sketch.tailSeconds,
      ...layout,
      channels,
    };
  } finally {
    // Future voices must survive until rendering completes. Failure cleanup is
    // also bounded by Node closing this isolated browser context.
    engine.destroy();
  }
}

declare global {
  interface Window {
    renderSketch: typeof renderSketch;
  }
}
window.renderSketch = renderSketch;

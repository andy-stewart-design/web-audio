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

async function renderSketch(sketch: ReturnType<typeof normalizeCase>) {
  const schema = evaluateSource(sketch.code);
  // Resource diagnostics/local sample serving are the next step. Do not let
  // currently unsupported resource cases accidentally pass as partial audio.
  for (const instrument of schema.instruments) {
    if (instrument.type === "sampler")
      throw new Error("Sampler cases require Step 1.5 local resource support");
    if (instrument.notesOut)
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

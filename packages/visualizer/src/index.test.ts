import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Visualizer, { Visualizer as NamedVisualizer } from "./index";

class FakeGradient {
  readonly stops: [number, string][] = [];

  addColorStop(offset: number, color: string) {
    this.stops.push([offset, color]);
  }
}

class FakeCanvasContext {
  fillStyle: string | FakeGradient = "";
  strokeStyle = "";
  lineWidth = 0;
  readonly calls: string[] = [];

  setTransform() {
    this.calls.push("setTransform");
  }

  fillRect() {
    this.calls.push("fillRect");
  }

  beginPath() {
    this.calls.push("beginPath");
  }

  moveTo() {
    this.calls.push("moveTo");
  }

  lineTo() {
    this.calls.push("lineTo");
  }

  quadraticCurveTo() {
    this.calls.push("quadraticCurveTo");
  }

  closePath() {
    this.calls.push("closePath");
  }

  fill() {
    this.calls.push("fill");
  }

  stroke() {
    this.calls.push("stroke");
  }

  createLinearGradient() {
    this.calls.push("createLinearGradient");
    return new FakeGradient();
  }
}

class FakeCanvas {
  width = 0;
  height = 0;
  readonly context = new FakeCanvasContext();
  private _rect = { width: 320, height: 180 };

  getContext() {
    return this.context;
  }

  getBoundingClientRect() {
    return this._rect;
  }

  setRect(rect: { width: number; height: number }) {
    this._rect = rect;
  }
}

class FakeAnalyser {
  frequencyBinCount = 8;
  disconnect = vi.fn();
  getByteFrequencyData = vi.fn((data: Uint8Array) => data.fill(64));
  getByteTimeDomainData = vi.fn((data: Uint8Array) => data.fill(128));
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
}

let animationId = 0;
const animationCallbacks = new Map<number, FrameRequestCallback>();

function createVisualizer(config?: {
  type?: "bars" | "curve" | "waveform";
  colors?: ConstructorParameters<typeof Visualizer>[0]["colors"];
}) {
  const analyser = new FakeAnalyser();
  const canvas = new FakeCanvas();
  const visualizer = new Visualizer({
    analyser: analyser as unknown as AnalyserNode,
    canvas: canvas as unknown as HTMLCanvasElement,
    type: config?.type,
    colors: config?.colors,
  });

  return { analyser, canvas, visualizer };
}

beforeEach(() => {
  FakeResizeObserver.instances = [];
  animationId = 0;
  animationCallbacks.clear();

  vi.stubGlobal("window", { devicePixelRatio: 2 });
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      animationId += 1;
      animationCallbacks.set(animationId, callback);
      return animationId;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => {
      animationCallbacks.delete(id);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Visualizer exports", () => {
  it("exports the visualizer class as default and named export", () => {
    expect(Visualizer).toBe(NamedVisualizer);
  });
});

describe("Visualizer lifecycle", () => {
  it("sizes the canvas and observes it on construction", () => {
    const { canvas } = createVisualizer();

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(FakeResizeObserver.instances[0]?.observe).toHaveBeenCalledOnce();
    expect(canvas.context.calls).toContain("setTransform");
  });

  it("starts animation only once", () => {
    const { visualizer } = createVisualizer();

    visualizer.start();
    visualizer.start();

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(visualizer.paused).toBe(false);
  });

  it("stops animation and is safe to stop repeatedly", () => {
    const { visualizer } = createVisualizer();

    visualizer.start();
    visualizer.stop();
    visualizer.stop();

    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(visualizer.paused).toBe(true);
  });

  it("disconnects the resize observer but not the external analyser on destroy", () => {
    const { analyser, visualizer } = createVisualizer();

    visualizer.start();
    visualizer.destroy();

    expect(FakeResizeObserver.instances[0]?.disconnect).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(analyser.disconnect).not.toHaveBeenCalled();
    expect(visualizer.paused).toBe(true);
  });
});

describe("Visualizer data and rendering", () => {
  it("uses frequency data for the default curve type", () => {
    const { analyser, visualizer } = createVisualizer();

    visualizer.start();

    expect(analyser.getByteFrequencyData).toHaveBeenCalledOnce();
    expect(analyser.getByteTimeDomainData).not.toHaveBeenCalled();
  });

  it("uses frequency data for bars", () => {
    const { analyser, visualizer } = createVisualizer({ type: "bars" });

    visualizer.start();

    expect(analyser.getByteFrequencyData).toHaveBeenCalledOnce();
    expect(analyser.getByteTimeDomainData).not.toHaveBeenCalled();
  });

  it("uses time-domain data for waveform", () => {
    const { analyser, visualizer } = createVisualizer({ type: "waveform" });

    visualizer.start();

    expect(analyser.getByteTimeDomainData).toHaveBeenCalledOnce();
    expect(analyser.getByteFrequencyData).not.toHaveBeenCalled();
  });

  it("can change type while stopped", () => {
    const { analyser, visualizer } = createVisualizer({ type: "curve" });

    visualizer.setType("waveform");

    expect(analyser.getByteTimeDomainData).toHaveBeenCalledOnce();
  });

  it("can change colors while stopped", () => {
    const { canvas, visualizer } = createVisualizer({ type: "waveform" });

    visualizer.setColors({
      background: [0.2, 0.1, 10],
      foreground: [0.8, 0.2, 20],
    });

    expect(canvas.context.fillStyle).toBe("oklch(0.2 0.1 10)");
    expect(canvas.context.strokeStyle).toBe("oklch(0.8 0.2 20)");
  });

  it("does not throw for zero-size canvas measurements", () => {
    const { canvas, visualizer } = createVisualizer();
    canvas.setRect({ width: 0, height: 0 });

    expect(() => {
      FakeResizeObserver.instances[0]?.callback(
        [],
        FakeResizeObserver.instances[0] as unknown as ResizeObserver,
      );
      visualizer.start();
    }).not.toThrow();
  });
});

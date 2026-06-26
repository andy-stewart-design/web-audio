import { drawOscilloscope, drawSpectrumBars, drawSpectrumCurve } from "./utils";

type VisualizerType = "bars" | "curve" | "waveform";
type Oklch = [lightness: number, chroma: number, hue: number];

type VisualizerColors = {
  foreground?: Oklch;
  background?: Oklch;
};

type VisualizerConfig = {
  analyser: AnalyserNode;
  canvas: HTMLCanvasElement;
  type?: VisualizerType;
  colors?: VisualizerColors;
};

const defaultColors = {
  background: [0.1381, 0.006, 245] satisfies Oklch,
  foreground: [0.725, 0.36, 331.46] satisfies Oklch,
};

class Visualizer {
  private readonly _analyser: AnalyserNode;
  private readonly _canvas: HTMLCanvasElement;
  private readonly _ctx: CanvasRenderingContext2D;
  private readonly _resizeObserver: ResizeObserver;
  private _animationId: number | null = null;
  private _dataArray: Uint8Array<ArrayBuffer>;
  private _type: VisualizerType;
  private _colors: Required<VisualizerColors>;
  private _width = 0;
  private _height = 0;

  constructor(config: VisualizerConfig) {
    this._analyser = config.analyser;
    this._canvas = config.canvas;
    this._type = config.type ?? "curve";
    this._colors = {
      background: config.colors?.background ?? defaultColors.background,
      foreground: config.colors?.foreground ?? defaultColors.foreground,
    };
    this._dataArray = new Uint8Array(this._analyser.frequencyBinCount);

    const context = this._canvas.getContext("2d", {
      alpha: false,
      colorSpace: "display-p3",
    });

    if (!context) throw new Error("Could not get 2D context from canvas");

    this._ctx = context;
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this._canvas);
    this.draw = this.draw.bind(this);
    this.resize();
  }

  start(): void {
    this.resize();
    if (this._animationId === null) this.draw();
  }

  stop(): void {
    if (this._animationId === null) return;
    cancelAnimationFrame(this._animationId);
    this._animationId = null;
  }

  destroy(): void {
    this.stop();
    this._resizeObserver.disconnect();
  }

  setType(type: VisualizerType): void {
    this._type = type;
    if (this.paused) {
      this.readData();
      this.render();
    }
  }

  setColors(colors: VisualizerColors): void {
    this._colors = {
      background: colors.background ?? this._colors.background,
      foreground: colors.foreground ?? this._colors.foreground,
    };
    if (this.paused) this.render();
  }

  get paused() {
    return this._animationId === null;
  }

  private resize(): void {
    const rect = this._canvas.getBoundingClientRect();
    const width = Math.max(0, rect.width);
    const height = Math.max(0, rect.height);
    const dpr = window.devicePixelRatio || 1;

    this._canvas.width = Math.round(width * dpr);
    this._canvas.height = Math.round(height * dpr);

    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this._width = width;
    this._height = height;
    this.render();
  }

  private readData(): void {
    if (this._dataArray.length !== this._analyser.frequencyBinCount) {
      this._dataArray = new Uint8Array(this._analyser.frequencyBinCount);
    }

    if (this._type === "waveform") {
      this._analyser.getByteTimeDomainData(this._dataArray);
    } else {
      this._analyser.getByteFrequencyData(this._dataArray);
    }
  }

  private draw(): void {
    this._animationId = requestAnimationFrame(this.draw);
    this.readData();
    this.render();
  }

  private render(): void {
    const [backgroundL, backgroundC, backgroundH] = this._colors.background;
    this._ctx.fillStyle = `oklch(${backgroundL} ${backgroundC} ${backgroundH})`;
    this._ctx.fillRect(0, 0, this._width, this._height);

    switch (this._type) {
      case "bars":
        drawSpectrumBars(
          this._ctx,
          this._dataArray,
          this._width,
          this._height,
          this._colors.foreground,
        );
        break;
      case "curve":
        drawSpectrumCurve(
          this._ctx,
          this._dataArray,
          this._width,
          this._height,
          this._colors.foreground,
        );
        break;
      case "waveform":
        drawOscilloscope(
          this._ctx,
          this._dataArray,
          this._width,
          this._height,
          this._colors.foreground,
        );
        break;
    }
  }
}

export default Visualizer;
export {
  Visualizer,
  type Oklch,
  type VisualizerColors,
  type VisualizerConfig,
  type VisualizerType,
};

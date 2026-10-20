import type { ScheduledSource } from "../../types";
import { toAudioFrame } from "./supersaw-source";

interface NoiseSourceOptions {
  color: "white" | "pink";
  seed: number;
  startFrame: number;
  stopFrame: number;
}

function isEndedMessage(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "ended"
  );
}

class NoiseSource implements ScheduledSource {
  readonly node: AudioWorkletNode;
  onended: (() => void) | null = null;

  private _ended = false;
  private _disconnected = false;
  private _started = false;
  private _portClosed = false;
  private readonly _onProcessorError = () => this._finish();

  constructor(
    private readonly _ctx: BaseAudioContext,
    options: NoiseSourceOptions,
  ) {
    this.node = new AudioWorkletNode(_ctx, "noise-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        color: options.color,
        seed: options.seed,
        startFrame: options.startFrame,
        stopFrame: options.stopFrame,
      },
    });
    this.node.port.onmessage = (event: MessageEvent<unknown>) => {
      if (isEndedMessage(event.data)) this._finish();
    };
    this.node.addEventListener("processorerror", this._onProcessorError);
    this.node.addEventListener("error", this._onProcessorError);
  }

  connect(destination: AudioNode) {
    return this.node.connect(destination);
  }

  disconnect() {
    if (this._disconnected) return;
    this._disconnected = true;
    try {
      if (!this._ended) {
        const cancel = this.node.parameters.get("cancel");
        if (!cancel) throw new Error("Missing noise cancellation AudioParam");
        cancel.setValueAtTime(1, this._ctx.currentTime);
      }
    } finally {
      this.node.disconnect();
    }
    if (this._ended) this._closePort();
  }

  start(when = 0) {
    if (this._started || this._disconnected || this._ended) return;
    this._started = true;
    this.node.port.postMessage({
      type: "start",
      frame: this._frameAt(when),
    });
  }

  stop(when = 0) {
    if (this._disconnected || this._ended) return;
    this.node.port.postMessage({
      type: "stop",
      frame: this._frameAt(when),
    });
  }

  private _frameAt(time: number) {
    return toAudioFrame(this._ctx, time);
  }

  private _finish() {
    if (this._ended) return;
    this._ended = true;
    if (this._disconnected) this._closePort();
    this.onended?.();
  }

  private _closePort() {
    if (this._portClosed) return;
    this._portClosed = true;
    this.node.port.onmessage = null;
    this.node.removeEventListener("processorerror", this._onProcessorError);
    this.node.removeEventListener("error", this._onProcessorError);
    this.node.port.close();
  }
}

export default NoiseSource;
export type { NoiseSourceOptions };

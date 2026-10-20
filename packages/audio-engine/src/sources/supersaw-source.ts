import type { ScheduledSource } from "./types";

interface SupersawSourceOptions {
  voices: number;
  phaseSeed: number;
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

function toAudioFrame(ctx: BaseAudioContext, time: number) {
  const frame = time * ctx.sampleRate;
  const nearestFrame = Math.round(frame);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(frame)) * 4;
  if (Math.abs(frame - nearestFrame) <= tolerance)
    return Math.max(0, nearestFrame);
  return Math.max(0, Math.ceil(frame));
}

function getParameter(node: AudioWorkletNode, name: string) {
  const parameter = node.parameters.get(name);
  if (!parameter) throw new Error(`Missing supersaw AudioParam: ${name}`);
  return parameter;
}

class SupersawSource implements ScheduledSource {
  readonly node: AudioWorkletNode;
  readonly frequency: AudioParam;
  readonly detune: AudioParam;
  readonly spread: AudioParam;
  readonly width: AudioParam;
  onended: (() => void) | null = null;

  private _ended = false;
  private _disconnected = false;
  private _started = false;

  constructor(
    private readonly _ctx: BaseAudioContext,
    options: SupersawSourceOptions,
  ) {
    this.node = new AudioWorkletNode(_ctx, "supersaw-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: {
        voices: options.voices,
        phaseSeed: options.phaseSeed,
        startFrame: options.startFrame,
        stopFrame: options.stopFrame,
      },
    });
    this.frequency = getParameter(this.node, "frequency");
    this.detune = getParameter(this.node, "detune");
    this.spread = getParameter(this.node, "spread");
    this.width = getParameter(this.node, "width");
    this.node.port.onmessage = (event: MessageEvent<unknown>) => {
      if (isEndedMessage(event.data)) this._finish();
    };
  }

  connect(destination: AudioNode) {
    return this.node.connect(destination);
  }

  disconnect() {
    if (this._disconnected) return;
    this._disconnected = true;
    this.node.port.onmessage = null;
    this.node.port.close();
    this.node.disconnect();
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
    this.onended?.();
  }
}

export default SupersawSource;
export { toAudioFrame };
export type { SupersawSourceOptions };

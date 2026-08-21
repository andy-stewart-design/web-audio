import type { BusSchema } from "@web-audio/schema";

class RuntimeBus {
  readonly input: GainNode;
  private readonly _output: GainNode;
  private _destroyed = false;

  constructor(ctx: AudioContext, schema: BusSchema, destination: AudioNode) {
    this.input = ctx.createGain();
    this._output = ctx.createGain();
    this._output.gain.value = schema.gain;
    this.input.connect(this._output);
    this._output.connect(destination);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.input.disconnect();
    this._output.disconnect();
  }
}

export default RuntimeBus;

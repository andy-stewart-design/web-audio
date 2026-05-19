// Globals available in AudioWorkletGlobalScope
// These are not part of the standard DOM lib because they only exist
// inside the AudioWorklet thread, not the main thread.
declare const sampleRate: number;
declare const currentFrame: number;

declare function registerProcessor(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- worklet processor constructors accept varying option types
  processorCtor: new (options: any) => AudioWorkletProcessor,
): void;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

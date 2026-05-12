// Stub AudioWorkletProcessor and worklet globals for tests
// that import from lfo-processor.ts
globalThis.AudioWorkletProcessor = class AudioWorkletProcessor {
  port = {} as MessagePort;
} as any;

globalThis.sampleRate = 44100;
globalThis.registerProcessor = () => {};

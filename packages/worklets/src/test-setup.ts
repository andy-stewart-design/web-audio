// Stub AudioWorkletProcessor and worklet globals for tests
// that import from lfo-processor.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

g.AudioWorkletProcessor = class AudioWorkletProcessor {
  port = {} as MessagePort;
};

g.sampleRate = 44100;
g.registerProcessor = () => {};

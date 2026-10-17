// Stub AudioWorkletProcessor and worklet globals for tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

g.__registeredProcessors = new Map();
g.__workletMessages = [];
g.AudioWorkletProcessor = class AudioWorkletProcessor {
  port = {
    postMessage(message: unknown) {
      g.__workletMessages.push(message);
    },
  } as unknown as MessagePort;
};

g.sampleRate = 44100;
g.currentFrame = 0;
g.registerProcessor = (name: string, processor: unknown) => {
  g.__registeredProcessors.set(name, processor);
};

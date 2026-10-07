// Fault injection changes only module bytes in these expected-error sketches.
// Registration, AudioWorkletNode creation and execution still use native APIs.
export function withBrokenWorklet(code: string, moduleSource: string) {
  return `
    const nativeAddModule = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = function (url, options) {
      const replacement = URL.createObjectURL(new Blob(
        [${JSON.stringify(moduleSource)}], {type: 'text/javascript'}
      ));
      return nativeAddModule.call(this, replacement, options);
    };
    ${code}
    d.synth('sine').notes(69).gain(0.2).push();
  `;
}

export const throwingProcessor = `
  registerProcessor('lfo-processor', class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [{name: 'outputA', defaultValue: 0}, {name: 'outputB', defaultValue: 0}];
    }
    process() { throw new Error('deliberate processor failure'); }
  });
`;

// The one-bar/no-tail fault case ends at 2.1 s. Fail in its final quantum,
// after producing healthy audio, to exercise completion/error event ordering.
export const throwingLateProcessor = `
  registerProcessor('lfo-processor', class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [{name: 'outputA', defaultValue: 0}, {name: 'outputB', defaultValue: 0}];
    }
    process(_inputs, outputs) {
      outputs[0][0].fill(1400);
      if (currentFrame >= Math.floor((2.1 * sampleRate - 1) / 128) * 128)
        throw new Error('deliberate late processor failure');
      return true;
    }
  });
`;

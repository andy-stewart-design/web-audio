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

// Fail in the actual recording's final quantum, after producing healthy audio,
// to exercise completion/error event ordering without assuming a duration/rate.
export function throwingLateProcessor(frameCount: number) {
  return `
    registerProcessor('lfo-processor', class extends AudioWorkletProcessor {
      static get parameterDescriptors() {
        return [{name: 'outputA', defaultValue: 0}, {name: 'outputB', defaultValue: 0}];
      }
      process(_inputs, outputs) {
        const output = outputs[0][0];
        output.fill(1400);
        if (currentFrame + output.length >= ${frameCount})
          throw new Error('deliberate late processor failure');
        return true;
      }
    });
  `;
}

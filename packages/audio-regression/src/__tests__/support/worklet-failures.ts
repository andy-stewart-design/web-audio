// Fault injection changes only module bytes in these expected-error sketches.
// Registration, AudioWorkletNode creation and execution still use native APIs.
export function withBrokenWorklet(code: string, moduleSource: string) {
  return `
    const nativeAddModule = AudioWorklet.prototype.addModule;
    let registrationIndex = 0;
    AudioWorklet.prototype.addModule = function (url, options) {
      // Engine readiness registers the existing LFO module first. Replace only
      // that module; let additional engine modules register normally.
      if (registrationIndex++ !== 0)
        return nativeAddModule.call(this, url, options);
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
export function withBrokenNoiseWorklet(code: string, moduleSource: string) {
  return `
    const nativeAddModule = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = async function (url, options) {
      const source = await fetch(url).then(response => response.text());
      if (!source.includes('noise-processor'))
        return nativeAddModule.call(this, url, options);
      const replacement = URL.createObjectURL(new Blob(
        [${JSON.stringify(moduleSource)}], {type: 'text/javascript'}
      ));
      return nativeAddModule.call(this, replacement, options);
    };
    ${code}
  `;
}

export const throwingNoiseProcessor = `
  registerProcessor('noise-processor', class extends AudioWorkletProcessor {
    process() { throw new Error('deliberate noise processor failure'); }
  });
`;

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

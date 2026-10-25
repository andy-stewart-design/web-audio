export const aliases = ["d", "drome"] as const;
type Alias = (typeof aliases)[number];

const matrixValues = {
  direct: {
    minimum: '"<0.1 0.2>"',
    maximum: '"<0.8 0.9>"',
    levels: '"0.2 0.8"',
    notes: '"60 64"',
    endpointA: '"<200 300>"',
    endpointB: '"<400 800>"',
    attack: '"0.01 0.02"',
    decay: "0.1",
    sustain: "0.7",
    release: "0.2",
    chopSequence: '"<0 2 1 3>"',
  },
  reusable: {
    minimum: 'API.sh("<0.1 0.2>")',
    maximum: 'API.sh("<0.8 0.9>")',
    levels: 'API.sh("0.2 0.8")',
    notes: 'API.sh("60 64")',
    endpointA: 'API.sh("<200 300>")',
    endpointB: 'API.sh("<400 800>")',
    attack: 'API.sh("0.01 0.02")',
    decay: 'API.sh("0.1")',
    sustain: 'API.sh("0.7")',
    release: 'API.sh("0.2")',
    chopSequence: 'API.sh("<0 2 1 3>")',
  },
  structured: {
    minimum: "API.structured([0.1], [0.2])",
    maximum: "API.str([0.8], [0.9])",
    levels: "API.str([0.2, 0.8])",
    notes: "API.str([60, 64])",
    endpointA: "API.str(200, 300)",
    endpointB: "API.str(400, 800)",
    attack: "API.str([0.01, 0.02])",
    decay: "API.str(0.1)",
    sustain: "API.str(0.7)",
    release: "API.str(0.2)",
    chopSequence: "API.str([0], [2], [1], [3])",
  },
} as const;

export function evaluatedMatrixSketch(
  api: Alias,
  representation: keyof typeof matrixValues,
) {
  const values = matrixValues[representation];
  return `
    const minimum = ${values.minimum};
    const maximum = ${values.maximum};
    const levels = ${values.levels};
    const notes = ${values.notes};
    const endpointA = ${values.endpointA};
    const endpointB = ${values.endpointB};
    const attack = ${values.attack};
    const decay = ${values.decay};
    const sustain = ${values.sustain};
    const release = ${values.release};
    const chopSequence = ${values.chopSequence};
    const envelope = ${api}.env(minimum, maximum)
      .adsr(attack, decay, sustain, release)
      .mode("bounded");
    const lfo = ${api}.lfo(endpointA, endpointB);
    const filter = ${api}.filter("lp", endpointB).q(1);
    ${api}.loadSamples({ bank: "local", samples: { bd: ["/bd.wav"] } });
    ${api}
      .synth()
      .notes(notes)
      .gain(envelope)
      .adsr(attack, decay, sustain, release)
      .noise("pink", levels)
      .detune(lfo)
      .fx(filter)
      .push();
    ${api}.sample("bd").bank("local").chop(4, chopSequence).notes(notes).push();
  `.replaceAll("API", api);
}

export function allowedSourcesSketch(api: Alias) {
  return `
    const bound = ${api}.rand().steps(2, 0).range(-1, 1);
    const sequence = ${api}.rand().steps(2, 0).range(0, 3);
    const envelope = ${api}.env(0, bound);
    const lfo = ${api}.lfo(0, 1);
    const midi = ${api}.midi.cc(74).range(20, 20000).default(1000);
    ${api}.loadSamples({ bank: "local", samples: { bd: ["/bd.wav"] } });
    ${api}
      .synth()
      .notes("60 64")
      .gain(envelope)
      .noise(lfo)
      .detune(midi)
      .fx(${api}.filter("lp", midi))
      .push();
    ${api}.sample("bd").bank("local").chop(4, sequence).push();
  `;
}

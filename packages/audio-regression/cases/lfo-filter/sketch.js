d.synth("sawtooth")
  .notes(57)
  .gain(0.3)
  .adsr(0.005, 0, 1, 0.02)
  .fx(
    d
      .lpf(
        d.lfo([300, 900], [2500, 4500]).norm().wave("sine").speed(1).off(0.25),
      )
      .q(0.5),
  )
  .push();

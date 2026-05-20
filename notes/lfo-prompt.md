I want to add a new class of automation to the system: low frequency oscillators. It will be analogous to the envelope class we have now (those two classes could be grouped as "automation"). We will need to define the schema for the LFO and implement the logic in both the fluid language and the audio engine.

Here are the contours of the API that I am imagining. The most basic usage of this class would look like:

`d.lfo(800, 400)`

This would produce an sine wave lfo with a period of 1 bar (the LFO should be synced to the current bpm). The baseline output value of the LFO would be 800, and it would oscillate between 400 and 1200 (+/- 400) over the duration of its period.

You should be able to further modify the lfo with the following methods:

1. d.lfo(800, 400).speed(0.5) // 1 period every 2 bars
2. d.lfo(800, 400).speed(4) // 4 periods every 1 bars
3. d.lfo(800, 400).type(“sawtooth”) // sine, triangle, square, sawtooth
4. d.lfo(400, 1200).norm() // makes the input of the lfo constructor max/min rather than baseline/offset
5. d.lfo(800, 400).offset(0.5) // period offset

Altogether, that would look like:

```js
d.lfo(400, 1200)
    .speed(0.5) // 1 period every 2 bars
    .type(“sawtooth”) // sine, tri, sq
    .norm() // min 400, max 1200
    .offset(0.5) // period offset
```

Feel free to poke at any of these ideas or offer new ideas if there is anything I have missed. I think this could be a good place to bring in a custom AudioWorklet/AudioWorkletNode to give us more control over things like the offset of the period.

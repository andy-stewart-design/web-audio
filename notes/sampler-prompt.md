I'm going to brain dump some thoughts about the next thing I want to add to this project. I need you to help me put it together into a coherent plan. There's a lot here, so we should probably break it up into multiple prs.

- I want to add a new instrument to the system. We'll call it `sampler` and it will essentially be a wrapper for the Audio Buffer source node class of the Web Audio API.
- to make it structurally equivalent to the synth instrument, we will need to define what constitutes a "note". I think it should be playback speed, because then we can do some interesting things with allowing you to transpose a sample to create a keyboard.
- This class will be considerably more complex than the synth instrument because there is a lot more that you might want to do with a sample. Here are some known features that I would like to add:
  - The most basic use case if fire-and-forget — good for one-shots like drum hits.
  - Samples should be loaded JIT. When a user hits play, we should wait until all of the current samples are loaded before starting playback. We will need to decide how to handle loading behavior if a user adds a sample while the sketch is playing.
  - By default, we will have bank of samples users can use. The api could look something like `d.sample("bd").bank("tr808")` where `bd` (bass drum) is the sample name and `tr808` is the sample bank we are pulling from
  - Users should also be allowed to add their own samples. I can imagine doing that in a few ways:
    - referencing an external JSON file that has a defined schema that specifies the samples to use
    - adding that same schema as an inline object in the repl with a new method like d.loadSamples({ ... })
    - Uploading files from their local machine
  - It would be cool to be able to set a root and scale, similar to the synth, that would allow you to transpose a single sample to create a "keyboard"
  - One level up from that, it would be rad to be able to be able to do multi-sampling — basically, being able to specify multiple samples at different points in the scale so that you can build an even bigger keyboard without degrading any one sample too much. That could look something like `{ A3: "<filpath>", B3: "<filpath>", C3: "<filpath>", C4: "<filpath>", ... }`
  - Related to that, it would be cool to be able to use "audio sprites" — one file with multiple samples. That could look something like `{ A3: [0, 3776.2131519274376], B3: [11000, 5923.968253968254], C3: [18000, 4685.034013605442], C4: [24000, 6752.970521541951], ... }`. The two numbers represent the start and endpoints of a individual sample. I'm open to how those points should be described (time, percentage, etc).
  - It would also be cool to be able to do "sample chopping" — controling the start and end point of where a sample is played, and also be able to split the sample into sections and play them back in sequence like `d.sample("loop").chop(4, [0, 2, 1, 3])`

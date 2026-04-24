# Ubiquitous Language

## Timing & Rhythm

| Term                    | Definition                                                                                                                       | Aliases to avoid               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **AudioClock**          | The scheduler that emits beat and bar events against the Web Audio `AudioContext` timeline                                       | Timer, sequencer clock         |
| **BPM**                 | Beats per minute; the tempo of the clock                                                                                         | Tempo (as a variable name)     |
| **Beat**                | The smallest unit of musical time; at 120 BPM a beat lasts half a second. Parallel to **Step** in sequencing, but not equivalent | Tick, step (in timing context) |
| **Bar**                 | A group of beats (4 by default); the anchor between timing and sequencing — each bar, every instrument advances by one pattern   | Measure, loop                  |
| **Metronome**           | A snapshot of the current `{ beat, bar }` position passed to every clock callback                                                | Position, cursor               |
| **Bar start time**      | The `AudioContext` timestamp at which a bar begins; used as the scheduling anchor for all notes in that bar                      | Offset time                    |
| **Bar duration**        | The wall-clock length of one bar in seconds (`beatDuration × beatsPerBar`)                                                       | Loop length                    |
| **Lookahead**           | The polling interval (ms) at which the clock scheduler runs                                                                      | Tick rate                      |
| **Schedule-ahead time** | How far into the future (seconds) the clock pre-schedules audio events                                                           | Buffer window                  |

## Sequencing

Drome's sequencing model has three levels: **steps**, **patterns**, and **cycles**. Each level has a direct counterpart in the timing model — a step is to a pattern what a beat is to a bar. They are parallel concepts, not equivalent ones.

| Term            | Definition                                                                                                                                                                                      | Aliases to avoid                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Step**        | A single subdivision of a pattern, carrying a `value`, `offset`, `duration`, and `stepIndex`. Steps divide a pattern evenly — a 3-step pattern in a 4-beat bar means each step lasts 1.33 beats | Tick, beat (in sequencing context), note slot |
| **Step index**  | The zero-based position of a step within its pattern; used to look up per-step parameter values                                                                                                 | Step number                                   |
| **Offset**      | A step's fractional start time within a bar (0–1, where 1 = one full bar)                                                                                                                       | Time, position                                |
| **Pattern**     | A sequence of steps that plays over exactly one bar; the fundamental sequencing unit                                                                                                            | Bar (as sequencing unit), loop                |
| **Cycle**       | The full, repeating loop of an instrument's patterns; N patterns = N bars before repetition                                                                                                     | Loop, sequence (as a type)                    |
| **Note**        | A single pitched value within a step. In a synthesizer, expressed as a MIDI integer; in a sampler, expressed as a float (0.0–1.0) representing playback position                                | Pitch, value                                  |
| **Chord**       | Two or more notes played simultaneously within a single step                                                                                                                                    | Poly note, multi-note                         |
| **Mask**        | The binary grid derived from rhythm modifiers; `1` = active step, `0` = silent                                                                                                                  | Gate, trigger grid                            |
| **Modifier**    | A rhythm function (`.euclid()`, `.xox()`, `.hex()`, etc.) applied to a cycle to gate which steps fire                                                                                           | Pattern (in modifier context), grid           |
| **ValueCycle**  | A cycle of plain numbers (e.g. MIDI notes, parameter values)                                                                                                                                    | NoteList                                      |
| **BinaryCycle** | A cycle of `0`/`1` values used as a rhythmic mask                                                                                                                                               | TriggerCycle                                  |
| **ChordCycle**  | A cycle of nullable number arrays where each step may hold multiple simultaneous notes                                                                                                          | PolyCycle                                     |
| **RandomCycle** | A cycle whose values are generated deterministically from a seed rather than stored explicitly                                                                                                  | StochasticCycle                               |
| **Ribbon**      | A RandomCycle's seed configuration, optionally segmented into looping sub-sequences                                                                                                             | Seed list                                     |
| **Segment**     | One named range within a ribbon: `{ seed, len }`                                                                                                                                                | Seed chunk                                    |

## Instruments

| Term            | Definition                                                                                          | Aliases to avoid                                  |
| --------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Instrument**  | An abstract sound source that owns a note cycle and schedules audio per bar                         | Track, voice, player                              |
| **Synthesizer** | A concrete instrument that generates audio by shaping an oscillator with envelopes and effects      | Synth                                             |
| **Oscillator**  | The raw sound generator inside a synthesizer; produces a continuous waveform at a given frequency   | Synth (when the oscillator specifically is meant) |
| **Waveform**    | The shape of an oscillator's output: `sine`, `square`, `sawtooth`, `triangle`, or `supersaw`        | Wave type, oscillator type                        |
| **Sampler**     | A concrete instrument that plays back pre-recorded audio; notes control playback position (0.0–1.0) | Sample player                                     |
| **Sample Bank** | A named collection of audio samples (e.g. `tr808`), accessible by short names (`bd`, `sd`, `hh`)    | Sample library, kit                               |

## Lifecycle

| Term         | Definition                                                                                                                               | Aliases to avoid |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Evaluate** | The act of executing a block of code in Drome's live environment; makes the `drome` object available and queues any defined instruments  | Run, execute     |
| **Push**     | Queues an instrument for playback at the next bar boundary; instruments are defined but silent until pushed                              | Activate, start  |
| **Queue**    | The holding area for instruments waiting to go live; populated by `.push()`, drained on commit                                           | Buffer, pending  |
| **Commit**   | The automatic moment at each bar boundary when queued instruments go live and the previous set stops; ensures changes are always in sync | Apply, swap      |

## Automation

| Term              | Definition                                                                                                                                             | Aliases to avoid            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| **Parameter**     | A single automatable value backed by a `ValueCycle` or `RandomCycle`                                                                                   | Param                       |
| **Envelope**      | An ADSR automation curve applied to a parameter over the duration of a note                                                                            | Ramp                        |
| **LFO**           | A slow oscillator used as a modulation source (not a sound source); cycles continuously at sub-audio rate to create vibrato, tremolo, or filter sweeps | Envelope (distinct concept) |
| **ADSR**          | Attack / Decay / Sustain / Release — the four phases of an envelope                                                                                    | Curve stages                |
| **Envelope mode** | Controls how ADSR stages map onto note duration: `bleed` (default — release extends past note end) or `clip` (all stages scale to fit within the note) | Tail mode                   |
| **Min / Max**     | The floor and ceiling of an envelope's value range                                                                                                     | Start/end, from/to          |
| **Sustain level** | The interpolated value held between decay end and note end, derived as `min + (max − min) × s`                                                         | Hold value                  |
| **Resolver**      | An engine-side object that generates concrete values from a `RandomSchema` for a given bar and step index                                              | Generator                   |

## Effects

| Term           | Definition                                                                                                                      | Aliases to avoid                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Effect**     | A signal processor applied in series after the oscillator                                                                       | Plugin, processor                            |
| **Gain**       | Controls the output volume of an instrument; unity is `1`, silence is `0`                                                       | Volume                                       |
| **Pan**        | Positions the sound in the stereo field; `-1` is hard left, `0` center, `1` hard right                                          | Balance                                      |
| **Filter**     | A biquad filter effect attenuating frequencies above or below a cutoff; parameterised by `frequency`, `Q`, `detune`, and `gain` | EQ, biquad                                   |
| **Delay**      | An echo effect that plays back a copy of the signal after a set time; `feedback` controls repeat decay                          | Echo                                         |
| **Reverb**     | Simulates acoustic space reflections; can be algorithmic or convolution-based (impulse response)                                | Room, space                                  |
| **Distortion** | Adds harmonic saturation by clipping or reshaping the waveform                                                                  | Overdrive, saturation (as a general synonym) |
| **Bitcrusher** | Degrades audio by reducing bit depth and sample rate, producing lo-fi digital crunch                                            | Lo-fi (as a term for this specific effect)   |

## Schema

| Term                  | Definition                                                                                              | Aliases to avoid       |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------- |
| **Schema**            | A plain, serialisable snapshot of an object's fully-resolved configuration, passed from Fluid to Engine | Config, options, state |
| **DromeSchema**       | Top-level schema containing all instrument schemas                                                      | Root schema            |
| **SynthesizerSchema** | Schema for one synthesizer: waveform, notes, detune, gain, and effects                                  | Synth config           |
| **ParameterSchema**   | A `StaticSchema` or `RandomSchema` representing a single automatable value                              | ValueSchema            |
| **StaticSchema**      | A parameter schema whose cycle values are stored explicitly                                             | FixedSchema            |
| **RandomSchema**      | A parameter schema whose values are generated at runtime from a seed                                    | GenerativeSchema       |
| **EnvelopeSchema**    | Schema for an ADSR envelope, where each stage is itself a `ParameterSchema`                             | ADSRSchema             |
| **FilterSchema**      | Schema for a biquad filter effect                                                                       | BiquadSchema           |

## Layers

| Term       | Definition                                                                                                | Aliases to avoid     |
| ---------- | --------------------------------------------------------------------------------------------------------- | -------------------- |
| **Fluid**  | The authoring layer — a builder API that constructs schemas via a fluent interface; resolves all defaults | DSL, config layer    |
| **Engine** | The playback layer — consumes schemas and schedules Web Audio nodes; never applies defaults               | Runtime, audio layer |

---

## Relationships

- A **Drome** owns one or more **Instruments** and produces a **DromeSchema**.
- A **Synthesizer** is a concrete **Instrument** containing an **Oscillator** shaped by a gain **Envelope**, a detune **Parameter**, and zero or more **Effects**.
- A **Cycle** contains one or more **Patterns**; each **Pattern** spans exactly one **Bar** and contains one or more **Steps**.
- A **Step** is to a **Pattern** what a **Beat** is to a **Bar** — parallel timing units, but not equivalent: a 3-step pattern in a 4-beat bar gives each step a duration of 1.33 beats.
- A **Parameter** is backed by either a **ValueCycle** (static values) or a **RandomCycle** (seeded values); it serialises to a **ParameterSchema**.
- An **Envelope** wraps five **Parameters** (min scalar + A, D, S, R cycle inputs) and an **Envelope mode**; it serialises to an **EnvelopeSchema**.
- A **Filter** is an **Effect** where frequency, Q, detune, and gain are each a **Parameter** or **Envelope**.
- The **AudioClock** drives the **Engine**: on each `prebar` event the engine calls `scheduleBar` on every **Instrument**, passing the bar index and **bar start time**.
- The **Engine** reads a **Schema** produced by **Fluid**; **Fluid** resolves all defaults so the **Engine** never needs to apply them.
- Calling `.push()` on an instrument adds it to the **Queue**; at the next **Bar**, **Commit** swaps the queued instruments live.

---

## Example dialogue

> **Dev:** "I want each note in the bar to have a different gain shape. How do I model that?"

> **Domain expert:** "Give the synthesizer's gain an **Envelope** whose `max` is a **Cycle** with multiple values — one per **step**. The engine picks the right value using the **step index** when it resolves the envelope for each note."

> **Dev:** "So the envelope's `max` isn't a single number — it's a full **Parameter**?"

> **Domain expert:** "Exactly. Every stage of an **Envelope** (A, D, S, R, and max) is a **Parameter**, which means each one can cycle, randomise, or stay constant. The engine resolves them all per note using the **bar index** and **step index**."

> **Dev:** "I have a 3-step pattern in a 4-beat bar — do the steps line up with beats?"

> **Domain expert:** "No — **steps** and **beats** are parallel concepts, not equivalent ones. Steps divide the **pattern** evenly: 3 steps means each step lasts 1.33 beats. Beat events still fire on beat boundaries; step durations are independent of them."

> **Dev:** "And if I want the filter cutoff to sweep open over a note, I use an **Envelope** on the filter frequency?"

> **Domain expert:** "Exactly. Any **Filter** parameter can be a **Parameter** (static or cycling) or an **Envelope** (ADSR curve). The **Engine** applies the envelope automation to the Web Audio `AudioParam` directly."

---

## Flagged ambiguities

- **"Pattern" vs "Modifier"** — "Pattern" has been used for two distinct concepts: (1) a sequence of steps spanning one bar (the canonical sequencing unit), and (2) a rhythm function like `.euclid()` or `.xox()` that gates which steps fire. Use **Pattern** only for the sequencing unit; use **modifier** (or the method name directly) for the rhythm functions.

- **"Cycle"** is used at two levels: (1) the outer `Cycle<T>` data type (an array of patterns, each an array of steps), and (2) the class hierarchy (`ValueCycle`, `BinaryCycle`, etc.). Use **cycle** (lowercase) for the data structure and the specific class name (e.g. `ValueCycle`) for the object.

- **"Step"** can mean (a) a slot in a modifier's binary grid (`0` or `1`) and (b) a `StaticSchemaValue` with timing metadata. Use **mask step** for the modifier context and **step** (or **scheduled step**) for the schema context.

- **"Gain"** is overloaded: it names the synthesizer's volume **Envelope**, the Web Audio `GainNode`, and the filter's `gain` **Parameter**. The synthesizer's gain is always an **Envelope**; the filter's gain is a **Parameter or Envelope** (shelf/peak filters only); the `GainNode` is a Web Audio implementation detail, not a domain term.

- **Supersaw** — defined in the lexicon as a waveform (`multiple detuned sawtooth oscillators layered`) but not present in the current `Waveform` schema type. Flag as a planned addition.

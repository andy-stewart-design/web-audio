# Ubiquitous Language

## Composition

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Drome** | The top-level composition object that owns a set of instruments and produces a `DromeSchema` | Session, project, song |
| **Instrument** | An abstract playback unit that owns a note cycle and schedules audio per bar | Track, voice, player |
| **Synthesizer** | A concrete instrument that generates sound via an oscillator + gain chain | Synth, oscillator |
| **Effect** | A signal processor (e.g. filter) applied in series after the oscillator | Plugin, processor |
| **Filter** | A biquad filter effect parameterised by frequency, Q, detune, and gain | EQ, biquad |
| **Waveform** | The oscillator shape: `sine`, `square`, `sawtooth`, or `triangle` | Wave type, oscillator type |

## Timing

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **AudioClock** | The scheduler that emits beat and bar events against the Web Audio `AudioContext` timeline | Timer, sequencer clock |
| **Bar** | One full musical measure; the primary loop unit for scheduling | Measure, loop |
| **Beat** | A single subdivision within a bar | Tick, step (in timing context) |
| **BPM** | Beats per minute; the tempo of the clock | Tempo (as a variable name) |
| **Metronome** | A snapshot of the current `{ beat, bar }` position passed to every clock callback | Position, cursor |
| **Bar start time** | The `AudioContext` timestamp at which a bar begins, used as the scheduling anchor | Offset time |
| **Bar duration** | The wall-clock length of one bar in seconds (`beatDuration × beatsPerBar`) | Loop length |
| **Lookahead** | The polling interval (ms) at which the clock scheduler runs | Tick rate |
| **Schedule-ahead time** | How far into the future (seconds) the clock pre-schedules audio events | Buffer window |

## Patterns & Cycles

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Cycle** | An ordered list of bars; each bar is a list of steps that repeats modulo its length | Loop, sequence (as a type) |
| **Step** | A single playback slot within a bar, carrying `value`, `offset`, `duration`, and `stepIndex` | Tick, event, note slot |
| **Step index** | The zero-based position of a step within its bar; used to look up parameter values | Step number |
| **Offset** | A step's fractional start time within a bar (0–1, where 1 = one full bar) | Time, position |
| **Pattern** | A rhythm modifier (Euclidean, hex, xox, etc.) applied to a cycle to gate which steps fire | Grid, mask |
| **Mask** | The binary pattern derived from rhythm modifiers; `1` = active step, `0` = silent | Gate, trigger grid |
| **ValueCycle** | A cycle of plain numbers (e.g. MIDI notes, parameter values) | NoteList |
| **BinaryCycle** | A cycle of `0`/`1` values used as a rhythmic mask | TriggerCycle |
| **ChordCycle** | A cycle of nullable number arrays, where each step may hold multiple simultaneous values | PolyCycle |
| **RandomCycle** | A cycle whose values are generated deterministically from a seed rather than stored explicitly | StochasticCycle |
| **Ribbon** | A RandomCycle's seed configuration, optionally segmented into looping sub-sequences | Seed list |
| **Segment** | One named range in a ribbon: `{ seed, len }` | Seed chunk |

## Parameters & Envelopes

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Parameter** | A single automatable value backed by a `ValueCycle` or `RandomCycle` | Param |
| **Envelope** | An ADSR automation curve applied to a parameter over the duration of a note | LFO (distinct concept), ramp |
| **ADSR** | Attack / Decay / Sustain / Release — the four phases of an envelope | Curve stages |
| **Envelope mode** | Controls overflow behaviour: `bleed` (release extends past note end) or `clip` (clamps at note end) | Tail mode |
| **Min / Max** | The floor and ceiling of an envelope's value range | Start/end, from/to |
| **Sustain level** | The interpolated value held between decay end and note end, derived as `min + (max − min) × s` | Hold value |

## Schema

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Schema** | A plain, serialisable snapshot of an object's fully-resolved configuration, passed from fluid to engine | Config, options, state |
| **DromeSchema** | Top-level schema containing all instrument schemas | Root schema |
| **SynthesizerSchema** | Schema for one synthesizer: waveform, notes, detune, gain, and effects | Synth config |
| **ParameterSchema** | A `StaticSchema` or `RandomSchema` representing a single automatable value | ValueSchema |
| **StaticSchema** | A parameter schema whose cycle values are stored explicitly | FixedSchema |
| **RandomSchema** | A parameter schema whose values are generated at runtime from a seed | GenerativeSchema |
| **EnvelopeSchema** | Schema for an ADSR envelope, where each stage is itself a `ParameterSchema` | ADSRSchema |
| **FilterSchema** | Schema for a biquad filter effect | BiquadSchema |

## Layers

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Fluid** | The authoring layer — a builder API that constructs schemas via a fluent interface | DSL, config layer |
| **Engine** | The playback layer — consumes schemas and schedules Web Audio nodes; applies no defaults | Runtime, audio layer |
| **Resolver** | An engine-side object that generates concrete values from a `RandomSchema` for a given bar | Generator |

---

## Relationships

- A **Drome** owns one or more **Instruments** and produces a **DromeSchema**.
- A **Synthesizer** is the only concrete **Instrument**; it holds a notes **Cycle**, a gain **Envelope**, a detune **Parameter**, and zero or more **Effects**.
- A **Cycle** contains one or more **Bars**; each **Bar** contains one or more **Steps**.
- A **Parameter** is backed by either a **ValueCycle** (static values) or a **RandomCycle** (seeded values); it serialises to a **ParameterSchema**.
- An **Envelope** wraps five **Parameters** (min scalar + ADSR cycle inputs) and an **Envelope mode**; it serialises to an **EnvelopeSchema**.
- A **Filter** is an **Effect** where frequency, Q, detune, and gain are each a **Parameter** or **Envelope**.
- The **AudioClock** drives the **Engine**: on each `prebar` event the engine calls `scheduleBar` on every **Instrument**, passing the bar index and **bar start time**.
- The **Engine** reads a **Schema** produced by **Fluid**; **Fluid** resolves all defaults so the **Engine** never needs to apply them.

---

## Example dialogue

> **Dev:** "I want each note in the bar to have a different gain shape. How do I model that?"

> **Domain expert:** "Give the synthesizer's gain an **Envelope** whose `max` is a **Cycle** with multiple values — one per **step**. The engine picks the right value using the **step index** when it resolves the envelope for each note."

> **Dev:** "So the envelope's `max` isn't a single number — it's a full **Parameter**?"

> **Domain expert:** "Exactly. Every stage of an **Envelope** (A, D, S, R, and max) is a **Parameter**, which means each one can cycle, randomise, or stay constant across bars. The engine resolves them all per note using the **bar index** and **step index**."

> **Dev:** "What if the release tail bleeds past the note's end time?"

> **Domain expert:** "That's controlled by **Envelope mode**. Set it to `bleed` and the release ramp extends past the note end; `clip` and it's clamped to the note's duration. The engine extends the oscillator's stop time by `releaseDur` when in bleed mode."

> **Dev:** "And the random notes — how does the engine know which MIDI note to play on a given step?"

> **Domain expert:** "It calls the **Resolver** with the current **bar index** and **step index**. The **Resolver** re-derives the same value deterministically from the **Ribbon**'s seed, so the output is stable across runs without storing every value in the **Schema**."

---

## Flagged ambiguities

- **"Cycle"** is used at two levels: (1) the outer `Cycle<T>` type (a `T[][]`, i.e. array of bars), and (2) the class hierarchy (`ValueCycle`, `BinaryCycle`, etc.). Prefer **cycle** (lowercase) when referring to the data structure and **Cycle class** or the specific subclass name when referring to the object.
- **"Step"** can mean (a) a slot in a pattern modifier array (`0` or `1`) and (b) a `StaticSchemaValue` with timing metadata. Use **mask step** for the pattern context and **step** (or **scheduled step**) for the schema context.
- **"Gain"** is overloaded: it names the synthesizer's volume envelope (`EnvelopeSchema`), the Web Audio `GainNode`, and the filter's `gain` parameter. The synthesizer's **gain** should be understood as an **Envelope** (always); the filter's **gain** is a **Parameter or Envelope** (shelf/peak filters only).
- **"Pattern"** is used for both the rhythm modifiers (`.euclid()`, `.xox()`) and the internal `pattern()` method on `PatternCycle`. Prefer **rhythm pattern** or **modifier** when referring to the former to avoid confusion with the class method.

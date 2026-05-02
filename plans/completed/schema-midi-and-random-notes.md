# Schema MIDI Conversion & Random Notes

Converts the note schema from frequencies to MIDI values and enables random note generation in the engine.

## Motivation

The schema currently stores note values as frequencies (converted from MIDI in the fluid layer). This works for static notes but breaks for random notes — the engine generates random values at runtime and has no way to convert scale degrees to frequencies without music theory knowledge.

By switching the schema to MIDI and adding a `valueMap` to `RandomSchema`, the fluid layer handles all music theory (scale degree → MIDI resolution) at schema time, and the engine does only a trivial MIDI → frequency conversion.

## Design Decisions

- **Schema uses MIDI notes, not frequencies.** More natural representation for a music system. MIDI → frequency is pure math (`440 * 2^((midi - 69) / 12)`), not music theory.
- **`midiToFrequency` moves to the engine.** It's currently in fluid (`packages/fluid/src/utils/midi-to-frequency.ts`) but is an execution concern — the engine needs it at playback time.
- **Fluid resolves all music theory before emitting the schema.** Scale degrees + root + scale → MIDI values. Root and scale do not appear on the schema.
- **`RandomSchema` gets an optional `valueMap`.** When present, the engine maps generated random integers through it. This lets fluid pre-compute scale degree → MIDI mappings without the engine needing to understand scales.

## Schema Changes

### `RandomSchema` (in `@web-audio/patterns`)

Add optional `valueMap` field:

```ts
interface RandomSchema {
  type: "random";
  dataType: "float" | "integer" | "binary";
  segments: { seed: number; len?: number }[];
  quantValue: number | undefined;
  range: { min: number; max: number } | undefined;
  algorithm: "xor" | "mulberry";
  cycle: StaticSchema;
  valueMap?: number[]; // optional: map random integers to these values
}
```

### `StaticSchemaValue` (unchanged)

The `value` field changes semantic meaning from frequency to MIDI, but the type stays `number`. No structural change needed.

## Implementation

### 1. Move `midiToFrequency` to the engine

- Copy `packages/fluid/src/utils/midi-to-frequency.ts` → `packages/audio-engine/src/utils/midi-to-frequency.ts`
- Keep a copy in fluid (it still needs it for the schema conversion — converting scale degrees to MIDI uses the root, not this function, but other internal utilities may reference it)
- Actually: fluid uses `midiToFrequency` in `Notes.midiToFrequency()` to convert to frequencies. After this change, fluid should stop converting to frequency and instead emit MIDI directly. So fluid's usage changes from `midiToFrequency(midiNote)` to just returning the MIDI value. The function can be removed from fluid entirely.

### 2. Update fluid `Notes.getSchema()` to emit MIDI

**Current behavior** (`packages/fluid/src/patterns/notes.ts`):

```ts
getSchema(): RandomSchema | StaticSchema {
  if (isRandomCycle(this._cycle)) {
    return this._cycle.getRandomSchema();
  } else {
    return this._cycle.getStaticSchema(this.midiToFrequency.bind(this));
  }
}
```

The `transformer` passed to `getStaticSchema` converts scale degrees → MIDI → frequency. After this change, it should convert scale degrees → MIDI only.

**New behavior:**

```ts
private degreeToMidi(degree: number): number {
  if (!this._scale) return degree + this._root;
  const octave = Math.floor(degree / this._scale.length) * 12;
  const step = this._scale[((degree % this._scale.length) + this._scale.length) % this._scale.length];
  return this._root + octave + step;
}

getSchema(): RandomSchema | StaticSchema {
  if (isRandomCycle(this._cycle)) {
    const schema = this._cycle.getRandomSchema();
    if (this._scale) {
      schema.valueMap = this._scale.map((_, i) => this.degreeToMidi(i));
    }
    return schema;
  } else {
    return this._cycle.getStaticSchema(this.degreeToMidi.bind(this));
  }
}
```

Note: the current `midiToFrequency` method on the `Notes` class actually handles both scale degree → MIDI and MIDI → frequency in one step. This refactor splits that: `degreeToMidi` handles scale/root resolution, and the engine handles MIDI → frequency.

### 3. Add `valueMap` to `RandomSchema` type

In `packages/patterns/src/types.ts`, add `valueMap?: number[]` to the `RandomSchema` interface.

### 4. Update `RandomResolver` to support `valueMap`

In `packages/audio-engine/src/random-resolver.ts`, after generating a value, check for `valueMap`:

```ts
// In the generate loop, after mapping:
const rawValue = this._mapper(rFloat, rangeStart, rangeEnd);
if (this._schema.valueMap) {
  const index = Math.floor(rawValue) % this._schema.valueMap.length;
  result.push(this._schema.valueMap[index]);
} else {
  result.push(rawValue);
}
```

### 5. Update `SynthesizerPlayer` to handle MIDI → frequency and random notes

**Add MIDI → frequency conversion:**

```ts
private _midiToFrequency(midi: number): number {
  if (midi <= 0 || midi > 127) return 0;
  return 440 * Math.pow(2, (midi - 69) / 12);
}
```

**Update `_scheduleNote`** to convert `note.value` from MIDI to frequency:

```ts
const osc = new OscillatorNode(this._ctx, {
  type: this._schema.waveform,
  frequency: this._midiToFrequency(note.value),
  detune: detuneValue,
});
```

**Update `scheduleBar`** to handle random notes:

```ts
scheduleBar(barIndex: number, barStartTime: number) {
  const notes = this._schema.notes;

  if (notes.type === "random") {
    // Use the embedded cycle for timing, resolve random values for pitch
    const mask = notes.cycle.cycle[barIndex % notes.cycle.cycle.length];
    mask.forEach((step, stepIndex) => {
      if (step.value === 0) return;
      const midiNote = this._resolve(notes, barIndex, stepIndex);
      const detuneValue = this._resolve(this._schema.detune, barIndex, stepIndex);
      this._scheduleNote(
        { ...step, value: midiNote },
        barStartTime,
        detuneValue,
      );
    });
    return;
  }

  const notesBar = notes.cycle[barIndex % notes.cycle.length];
  notesBar.forEach((note) => {
    const detuneValue = this._resolve(this._schema.detune, barIndex, note.stepIndex);
    this._scheduleNote(note, barStartTime, detuneValue);
  });
}
```

### 6. Remove `midiToFrequency` from fluid

- Delete `packages/fluid/src/utils/midi-to-frequency.ts`
- Remove the import from `packages/fluid/src/patterns/notes.ts`
- The `Notes` class no longer needs the old `midiToFrequency` method — replaced by `degreeToMidi`

## Files Touched

| Package                   | File                             | Change                                                              |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------- |
| `@web-audio/patterns`     | `src/types.ts`                   | Add `valueMap?: number[]` to `RandomSchema`                         |
| `@web-audio/fluid`        | `src/patterns/notes.ts`          | Emit MIDI instead of frequency; build `valueMap` for random + scale |
| `@web-audio/fluid`        | `src/utils/midi-to-frequency.ts` | Remove                                                              |
| `@web-audio/audio-engine` | `src/utils/midi-to-frequency.ts` | Add                                                                 |
| `@web-audio/audio-engine` | `src/random-resolver.ts`         | Support `valueMap` lookup                                           |
| `@web-audio/audio-engine` | `src/synthesizer-player.ts`      | MIDI → frequency conversion; handle random notes in `scheduleBar`   |

## Not in Scope

- Root or scale on the schema — fluid resolves these before emission
- Random notes without a scale (user provides MIDI range directly, e.g., `d.rand().range(48, 72)`)
- Envelope work (see [gain & envelope plan](./gain-and-envelope.md))

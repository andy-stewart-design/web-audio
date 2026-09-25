# Hit-Based Pattern Resolution Phase 1 Audit

## Purpose

This audit records the pre-migration indexing behavior and classifies every audio-engine pattern-resolution call before production scheduling changes begin.

The target contract remains defined in `hit-based-pattern-resolution-spec.md`. Characterization tests may assert current grid-addressed values so later phases can make each compatibility change explicit, but they keep timing assertions separate so value migration cannot silently change onset geometry.

## Characterization fixture matrix

The representative sparse mask contains active positions at grid indices `0` and `2`:

```ts
[
  { value: 1, offset: 0, duration: 0.25, stepIndex: 0 },
  { value: 1, offset: 0.5, duration: 0.25, stepIndex: 2 },
];
```

### Synthesizer ownership

| Case                        | Test ownership                                                                                                         | Current behavior captured                                             | Intended later change                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Static notes + static mask  | `Synthesizer trigger masks > cycles source notes across active static mask positions`                                  | Notes cycle by emitted-hit order; offsets remain sparse               | None for monophonic notes                                          |
| Static notes + random mask  | `Synthesizer sparse-rhythm indexing characterization > cycles static source notes across active random-mask positions` | Eligible random-mask positions consume static notes in hit order      | Random misses must not consume any event lane                      |
| Random notes + static mask  | parameterized random-note characterization                                                                             | Random notes resolve at mask grid indices `0` and `2`                 | Resolve at hit indices `0` and `1`                                 |
| Random notes + random mask  | parameterized random-note characterization                                                                             | Mask eligibility and random note values both use grid indices         | Keep mask eligibility grid-based; make note values hit-based       |
| Gain envelope               | current synth event-parameter characterization                                                                         | `max`, `a`, `d`, `s`, and `r` select indices `0` and `2`              | Select hit indices `0` and `1`                                     |
| Detune                      | current synth event-parameter characterization                                                                         | Detune selects indices `0` and `2`                                    | Select hit indices `0` and `1`                                     |
| Event-created filter effect | current synth event-parameter characterization                                                                         | Filter frequency selects indices `0` and `2`                          | Select hit indices `0` and `1`                                     |
| Multiple bars               | `selects value bars by bar index and values by sparse grid index`                                                      | `barIndex` selects the value bar; sparse grid index selects within it | Preserve bar selection, use bar-local hit index within it          |
| Chord + sparse mask         | `selects flattened chord voices across mask hits in the current scheduler`                                             | Flattened chord voices are consumed as separate mask values           | Preserve each source onset group; chord voices share one hit index |
| MIDI output                 | existing MIDI-output submission tests                                                                                  | MIDI uses the locally resolved note and gain                          | Keep one shared hit-resolved audio/MIDI path                       |

Gain-effect parameters use the same `Instrument._applyParamSchema()` branch as the characterized filter frequency. Phase 3 should still add one focused gain-effect assertion when converting target expectations.

### Sampler ownership

| Case                                | Test ownership                                                              | Current behavior captured                                                               | Intended later change                                                   |
| ----------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Static notes + static mask          | `cycles source notes across active static mask positions`                   | Notes cycle by emitted-hit order                                                        | None for monophonic notes                                               |
| Static notes + random mask          | sparse-rhythm static-note/random-mask characterization                      | Eligible positions consume source notes in hit order                                    | Random misses must not consume any event lane                           |
| Random notes + static mask          | parameterized random-note characterization                                  | Random note values resolve at grid indices `0` and `2`                                  | Resolve at hit indices `0` and `1`                                      |
| Random notes + random mask          | parameterized random-note characterization                                  | Eligibility and note values both use grid indices                                       | Keep eligibility grid-based; make note values hit-based                 |
| Variation                           | `uses sparse grid indices for variation before the hit-index migration`     | Variations `0` and `2` select buffers at grid indices `0` and `2`                       | Select variations at hit indices `0` and `1`                            |
| Static region start/end             | `uses sparse grid indices for static region boundaries`                     | Region bounds select indices `0` and `2`                                                | Select hit indices `0` and `1`                                          |
| Static region duration              | `relative duration uses original grid indices across mask gaps`             | Durations `0.01` and `0.03` resolve at grid indices `0` and `2`                         | Resolve `0.01` and `0.02` at hit indices `0` and `1`                    |
| Chop sequence                       | `uses sparse grid indices for chop sequence values`                         | Slices `0` and `2` resolve at grid indices `0` and `2`                                  | Resolve slices `0` and `1` at hit indices `0` and `1`                   |
| Shared gain/detune/envelope/effects | synth characterization plus shared `Instrument` implementation              | Sampler passes grid `stepIndex` into the same shared branches                           | Phase 5 must pass sampler hit index into the shared event context       |
| Playback failures                   | existing invalid-region, unavailable-reverse, and alternate-direction tests | Failed playback does not advance alternate direction                                    | Phase 5 adds preassigned-hit assertions so later values do not compress |
| Fit/chop across bars                | existing Fluid and sampler fit/chop tests                                   | Generated notes may rely on global `stepIndex` to continue a one-bar companion sequence | Normalize generated companion value bars before bar-local hit migration |

Sampler polyphony uses the same flattened static source schema shape as the synth, but its scheduler has a separate duplicate masked path. Phase 5 requires a sampler-specific chord fixture when onset grouping is implemented.

## Runtime resolver classification

### `packages/audio-engine/src/instruments/synthesizer.ts`

| Caller                                         | Current index           | Target category                | Target behavior                                                                                   |
| ---------------------------------------------- | ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `_scheduleMaskedBar()` random-mask eligibility | `maskStep.stepIndex`    | Grid-addressed onset selection | Unchanged; the engine must know whether the grid position becomes a hit before a hit index exists |
| `_scheduleMaskedBar()` random note source      | `maskStep.stepIndex`    | Hit-addressed event value      | Use the surviving onset's hit index                                                               |
| `_scheduleRandomBar()` random note source      | active-grid array index | Hit-addressed event value      | Keep/clarify as explicit hit enumeration; skip candidates must not advance it                     |
| `_scheduleSequenceBar()` static notes          | serialized note values  | Onset/value source             | Enumerate onset groups; all voices sharing a source step share one hit index                      |

Static source notes under a mask currently use a local `emittedIndex`, but that counter advances by flattened voice rather than source onset group. It is already hit-like for monophonic notes and incorrect for chords.

### `packages/audio-engine/src/instruments/sampler.ts`

| Caller                                          | Current index              | Target category                | Target behavior                          |
| ----------------------------------------------- | -------------------------- | ------------------------------ | ---------------------------------------- |
| `_scheduleMaskedBar()` random-mask eligibility  | `maskStep.stepIndex`       | Grid-addressed onset selection | Unchanged                                |
| `_scheduleMaskedBar()` random note source       | `maskStep.stepIndex`       | Hit-addressed event value      | Use hit index                            |
| `_scheduleRandomBar()` random note source       | active-grid array index    | Hit-addressed event value      | Keep/clarify as explicit hit enumeration |
| `_resolveVariationIndex()` per event            | scheduled note `stepIndex` | Hit-addressed event value      | Use hit index                            |
| `_resolveSourceWindow()` static region start    | scheduled note `stepIndex` | Hit-addressed event value      | Use hit index                            |
| `_resolveSourceWindow()` static region end      | scheduled note `stepIndex` | Hit-addressed event value      | Use hit index                            |
| `_resolveSourceWindow()` static region duration | scheduled note `stepIndex` | Hit-addressed event value      | Use hit index                            |
| `_resolveSourceWindow()` chop sequence          | scheduled note `stepIndex` | Hit-addressed event value      | Use hit index                            |

Nearest source-key selection and pitch-rate calculation consume the resolved note directly rather than resolving a separate parameter schema. They still need the same hit-associated note chosen by the scheduling path.

### `packages/audio-engine/src/instruments/instrument.ts`

| Caller                                              | Current index              | Target category           | Target behavior                        |
| --------------------------------------------------- | -------------------------- | ------------------------- | -------------------------------------- |
| `_applyParamSchema()` static/random event parameter | `note.stepIndex`           | Hit-addressed event value | Resolve with explicit event `hitIndex` |
| `_resolveDetune()` static/random detune             | supplied event `stepIndex` | Hit-addressed event value | Resolve with hit index                 |
| `_resolveEnvelope()` gain maximum                   | `note.stepIndex`           | Hit-addressed event value | Resolve with hit index                 |
| `_resolveEnvelope()` attack                         | `note.stepIndex`           | Hit-addressed event value | Resolve with hit index                 |
| `_resolveEnvelope()` decay                          | `note.stepIndex`           | Hit-addressed event value | Resolve with hit index                 |
| `_resolveEnvelope()` sustain                        | `note.stepIndex`           | Hit-addressed event value | Resolve with hit index                 |
| `_resolveEnvelope()` release                        | `note.stepIndex`           | Hit-addressed event value | Resolve with hit index                 |
| `_initLfos()` initial output bounds                 | fixed `(0, 0)`             | Non-event/bar-level       | Unchanged                              |
| `_updateLfoParams()` output bounds                  | `(barIndex, 0)`            | Non-event/bar-level       | Unchanged                              |

`_buildEffectNode()` routes static/random filter and gain-effect parameters through `_applyParamSchema()`, so those effect parameters are hit-addressed. LFO and MIDI CC branches in the same helper remain continuous/live control paths and do not become step-resolved by this work.

`Instrument._resolve()` remains a general `(schema, barIndex, valueIndex)` primitive. The semantic responsibility belongs to its caller; the method itself should not hard-code hit or grid meaning.

## Generated Fluid schema dependencies

### Explicit dependency: implicit natural chop over fit bars

`Sampler._getNotes()` currently calls:

```ts
getDefaultNotes(noteValue, sliceCount, fitBars, {
  globalStepIndex: true,
});
```

when `.chop(sliceCount)` has no authored sequence. For `.fit(2).chop(8)`, generated notes span two bars and use global note indices `0...7`.

`getChopSequenceSchema()` independently emits the implicit natural sequence `[0...7]` as one pattern bar. The current engine resolves that one-bar sequence with each generated note's global `stepIndex`, yielding slices `0...7` across the two-bar onset span.

After hit indices restart per bar, the same one-bar sequence would otherwise resolve `0...3` in each bar. Phase 4 must reshape the generated companion sequence to match generated onset bars, while preserving authored sequence syntax.

### Fit-only generated segmentation

Fit-only defaults already emit:

- one generated note in each fit bar with local `stepIndex: 0`;
- a generated chop sequence with one corresponding value in each bar.

This path is already structurally compatible with bar-local hit indexing and needs regression coverage rather than redesign.

### Authored chop sequences

When a static/cycling chop sequence is authored, `getDefaultNotesForSequence()` copies its bar geometry into generated notes. Notes and sequence already share bar structure and do not require global index bridging.

Random authored chop sequences use their random grid to generate onset geometry. Their eligibility/value split must be checked in later random integration, but they are not the implicit-natural-sequence dependency described above.

### `globalStepIndex` decision deferred

The audit does not conclude that `globalStepIndex` metadata should be removed. `StaticSchemaValue.stepIndex` remains geometry metadata under the new model. Phase 4 should first remove the companion value lane's dependency on global indexing, then decide whether the generated geometry still benefits from retaining global indices.

## Compatibility changes now explicitly owned

The later implementation phases must intentionally update these current characterization expectations:

- random note lookup under sparse masks: grid `0,2` → hits `0,1`;
- synth detune/envelope/effect lookup: grid `0,2` → hits `0,1`;
- flattened chord selection under masks → grouped chord onset selection;
- sampler variation: grid `0,2` → hits `0,1`;
- sampler region start/end/duration: grid `0,2` → hits `0,1`;
- sampler chop sequence: grid `0,2` → hits `0,1`;
- within-bar value selection on later mask bars: sparse grid positions → bar-local hit order.

The corresponding geometry assertions must remain unchanged when these value expectations move.

## Phase 1 completion

- Characterization fixtures cover static/random masks, static/random notes, common synth parameters, sampler identity/region/chop values, multi-bar selection, and chords.
- Every runtime `_resolve()` caller has an indexing category.
- The one known generated cross-bar dependency is isolated to implicit natural chop sequencing over generated fit/chop notes.
- No production code or public schema changed in Phase 1.

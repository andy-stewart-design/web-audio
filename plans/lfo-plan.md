# LFO Implementation Plan

## Context

The audio system currently supports envelopes as the only automation type — note-scoped ADSR shapes applied to gain, detune, and filter parameters. This plan implements the LFO feature defined in `plans/lfo-prd.md`: a free-running, BPM-synced oscillator that continuously modulates parameters across notes.

This is also the first AudioWorklet in the project, requiring a new `@web-audio/worklets` package. Additionally, a Gain effect is introduced to allow LFO modulation of gain without interfering with the instrument-level ADSR envelope.

**Key design decisions:**

- LFOs are free-running and BPM-synced (not per-note)
- Output formula: `outputA + outputB * oscillator_value`
- `norm` flag changes oscillator range from [-1, 1] to [0, 1]
- `speed` and `waveform` are arrays that cycle independently at period boundaries
- LFO nodes are long-lived (instrument lifecycle), managed by `id`
- Worklet processor source is exported as a string constant, loaded via Blob URL
- Instrument-level `gain` stays envelope-only; a new Gain effect enables LFO on gain

---

## Phase 1: Schema — `LfoSchema` and `GainEffectSchema`

### Step 1.1 — Add `LfoSchema` type

**Files:** `packages/schema/src/index.ts`

Add the `LfoSchema` interface:

```ts
interface LfoSchema {
  type: "lfo";
  id: string;
  outputA: ParameterSchema;
  outputB: ParameterSchema;
  speed: number[];
  waveform: Waveform[];
  phase: number;
  norm: boolean;
}
```

Export from the package.

**Acceptance criteria:**

- [x] `LfoSchema` is exported from `@web-audio/schema`
- [x] `LfoSchema` reuses the existing `Waveform` type for its `waveform` field
- [x] Package type-checks cleanly: `pnpm --filter @web-audio/schema exec tsc --noEmit`

**Testing:**

- [x] Type-level only: `pnpm --filter @web-audio/schema exec tsc --noEmit`

---

### Step 1.2 — Add `GainEffectSchema` type

**Files:** `packages/schema/src/index.ts`

```ts
interface GainEffectSchema {
  type: "gain";
  gain: ParameterSchema | EnvelopeSchema | LfoSchema;
}
```

Update `EffectSchema`:

```ts
type EffectSchema = FilterSchema | GainEffectSchema;
```

Export all new types.

**Acceptance criteria:**

- [x] `GainEffectSchema` is exported from `@web-audio/schema`
- [x] `EffectSchema` is now `FilterSchema | GainEffectSchema`
- [x] Package type-checks cleanly

**Testing:**

- [x] Type-level only: `pnpm --filter @web-audio/schema exec tsc --noEmit`

---

### Step 1.3 — Widen parameter types on `FilterSchema` and `SynthesizerSchema`

**Files:** `packages/schema/src/index.ts`

Update `FilterSchema` parameters to accept LFOs:

```ts
interface FilterSchema {
  type: "filter";
  filterType: FilterType;
  frequency: ParameterSchema | EnvelopeSchema | LfoSchema;
  q: ParameterSchema | EnvelopeSchema | LfoSchema;
  detune: ParameterSchema | EnvelopeSchema | LfoSchema;
  gain: ParameterSchema | EnvelopeSchema | LfoSchema;
}
```

Update `SynthesizerSchema.detune` to accept LFOs:

```ts
interface SynthesizerSchema {
  type: "synthesizer";
  waveform: Waveform;
  notes: ParameterSchema;
  detune: ParameterSchema | EnvelopeSchema | LfoSchema;
  gain: EnvelopeSchema; // unchanged — stays envelope-only
  effects: EffectSchema[];
}
```

**Acceptance criteria:**

- [x] `FilterSchema` parameters accept `LfoSchema`
- [x] `SynthesizerSchema.detune` accepts `LfoSchema`
- [x] `SynthesizerSchema.gain` remains `EnvelopeSchema` only
- [x] Package type-checks cleanly
- [x] Downstream packages (`fluid`, `audio-engine`) will show type errors — expected, resolved in later phases

**Testing:**

- [x] Type-level only: `pnpm --filter @web-audio/schema exec tsc --noEmit`

---

## Phase 2: `@web-audio/worklets` package

### Step 2.1 — Scaffold the package

Create `packages/worklets/` with:

- `package.json` — name `@web-audio/worklets`, same tooling as other packages (`tsdown`, `vitest`, `typescript`)
- `tsconfig.json` — extends shared config
- `src/index.ts` — package entry point

**Acceptance criteria:**

- [x] Package exists at `packages/worklets/`
- [x] `pnpm install` succeeds with the new workspace
- [x] Package builds cleanly: `pnpm --filter @web-audio/worklets build`

**Testing:**

- [x] Build produces `dist/index.mjs`

---

### Step 2.2 — Implement `LfoProcessor`

**Files:** `packages/worklets/src/processors/lfo-processor.ts`

The `LfoProcessor` extends `AudioWorkletProcessor`:

- **Static `parameterDescriptors`:** `outputA` (default 0) and `outputB` (default 0)
- **Constructor options (`processorOptions`):** `waveform: string[]`, `speed: number[]`, `phase: number`, `norm: boolean`, `barDuration: number`
- **Internal state:**
  - `_phase: number` — accumulator, initialized to `options.phase`
  - `_waveformIndex: number` — cycles through waveform array on period wrap
  - `_speedIndex: number` — cycles through speed array on period wrap
- **`process()` method:**
  - For each sample in the render quantum (128 samples):
    1. Read `outputA` and `outputB` from their `AudioParam` arrays
    2. Compute oscillator value based on current waveform at current phase
    3. Apply norm: if `norm`, remap [-1, 1] to [0, 1]
    4. Compute output: `outputA + outputB * oscillatorValue`
    5. Write to output channel
    6. Advance phase: `phase += (1 / sampleRate) * (currentSpeed / barDuration)`
    7. On phase wrap (≥ 1.0): subtract 1.0, advance `_waveformIndex` and `_speedIndex` independently
  - Return `true` (keep alive)

Waveform generation functions (pure, no Web Audio dependency):

```ts
function sine(phase: number): number {
  return Math.sin(2 * Math.PI * phase);
}
function triangle(phase: number): number {
  return 1 - 4 * Math.abs(Math.round(phase) - phase);
}
function sawtooth(phase: number): number {
  return 2 * (phase - Math.floor(phase + 0.5));
}
function square(phase: number): number {
  return phase % 1 < 0.5 ? 1 : -1;
}
```

**Acceptance criteria:**

- [x] `LfoProcessor` generates correct waveform values for all four types
- [x] Norm mode remaps output from [-1, 1] to [0, 1]
- [x] Phase accumulator wraps correctly
- [x] Speed and waveform indices advance independently on phase wrap
- [x] Output follows formula: `outputA + outputB * oscillatorValue`

**Testing:**

- [x] Unit test: each waveform function produces correct values at key phases (0, 0.25, 0.5, 0.75)
- [x] Unit test: norm remapping
- [x] Unit test: phase wrap triggers index advancement
- [x] Unit test: independent cycling of speed and waveform arrays

---

### Step 2.3 — Export processor source as string

**Files:** `packages/worklets/src/index.ts`

The build needs to compile `lfo-processor.ts` into a string constant that the audio-engine can load as a Blob URL. Approach: `tsdown` compiles the processor to a separate JS file, and the package entry reads it as a string (or the build is configured to inline it).

Simpler alternative: author the processor source as a template literal string directly in a dedicated file, exporting it as a constant. The waveform functions and class are all self-contained (no imports).

```ts
export const lfoProcessorSource: string = `
  // ... compiled processor code
`;
```

**Acceptance criteria:**

- [x] `lfoProcessorSource` is exported as a string from `@web-audio/worklets`
- [x] The string contains valid JavaScript that registers an `AudioWorkletProcessor`
- [x] Package builds cleanly

**Testing:**

- [x] Unit test: `lfoProcessorSource` contains `registerProcessor`
- [x] Integration: string can be loaded via `new Blob()` + `audioContext.audioWorklet.addModule()` (manual or browser test)

---

## Phase 3: Fluid — `Lfo` class and `d.lfo()`

### Step 3.1 — Implement `Lfo` class

**Files:** `packages/fluid/src/automations/lfo.ts` (new)

The `Lfo` class follows the same pattern as `Envelope`:

- **Constructor:** `(outputA: CycleInput, outputB: CycleInput)` — both stored as `Parameter` instances
- **Private fields:**
  - `_id: string` — `crypto.randomUUID()`
  - `_outputA: Parameter`
  - `_outputB: Parameter`
  - `_speed: number[]` — default `[1]`
  - `_waveform: Waveform[]` — default `["sine"]`
  - `_phase: number` — default `0`
  - `_norm: boolean` — default `false`
- **Chainable methods:**
  - `speed(...n: number[])` — sets `_speed`
  - `wave(...type: Waveform[])` — sets `_waveform`
  - `offset(n: number)` — sets `_phase`
  - `norm()` — sets `_norm = true`
- **`getSchema(): LfoSchema`** — serializes all fields. Note: each call to `getSchema()` uses the same `_id` (assigned at construction). If the user wants independent LFOs, they create separate `Lfo` instances.

**Acceptance criteria:**

- [x] `new Lfo(800, 400).getSchema()` returns a valid `LfoSchema` with all defaults
- [x] All chainable methods modify the schema output correctly
- [x] `outputA` and `outputB` accept `CycleInput` (static, array cycling, `RandomCycle`)
- [x] `speed()` and `wave()` accept variadic args and store as arrays
- [x] Each `Lfo` instance has a unique `id`

**Testing:**

- [x] Default schema output: speed `[1]`, waveform `["sine"]`, phase `0`, norm `false`
- [x] `.speed(2, 1)` → schema has `speed: [2, 1]`
- [x] `.wave("sawtooth", "triangle")` → schema has `waveform: ["sawtooth", "triangle"]`
- [x] `.offset(0.5)` → schema has `phase: 0.5`
- [x] `.norm()` → schema has `norm: true`
- [x] `outputA` with array input: `new Lfo([600, 800], 400)` → `outputA` is a `StaticSchema` with cycling values
- [x] `outputB` with `RandomCycle`: produces `RandomSchema`
- [x] Two `Lfo` instances have different `id` values

---

### Step 3.2 — Add `d.lfo()` to Drome

**Files:** `packages/fluid/src/index.ts`

```ts
lfo(...outputA: CycleInput) {
  return {
    ...new LfoPartial(outputA),
  };
}
```

Actually, since both `outputA` and `outputB` need to be provided, the simplest API is:

```ts
lfo(outputA: number | number[] | RandomCycle, ...outputB: CycleInput) {
  // Handle outputA conversion to CycleInput, then:
  return new Lfo(outputACycleInput, outputB);
}
```

Wait — looking at the constructor signature more carefully: `d.lfo(800, 400)` has two positional args. But `CycleInput` is `(number | number[])[] | [RandomCycle]`, which is variadic. We need a clean way to separate the two arguments.

The cleanest approach: `d.lfo()` takes exactly two arguments, each of which can be `number`, `number[]`, or `RandomCycle`. Internally the `Lfo` constructor wraps each in a `Parameter`.

```ts
type LfoInput = number | number[] | RandomCycle;

lfo(outputA: LfoInput, outputB: LfoInput) {
  return new Lfo(outputA, outputB);
}
```

The `Lfo` constructor normalizes each input into a `Parameter`:

```ts
constructor(outputA: LfoInput, outputB: LfoInput) {
  this._outputA = Lfo._toParameter(outputA);
  this._outputB = Lfo._toParameter(outputB);
}

private static _toParameter(input: LfoInput): Parameter {
  if (input instanceof RandomCycle) return new Parameter(input);
  return new Parameter(Array.isArray(input) ? input : [input]);
}
```

Import `Lfo` and add to `Drome` class.

**Acceptance criteria:**

- [x] `d.lfo(800, 400)` returns an `Lfo` instance
- [x] `d.lfo([600, 800], 400)` works with array cycling on `outputA`
- [x] `d.lfo(d.rand(600, 1000), 400)` works with `RandomCycle` on `outputA`
- [x] Chaining works: `d.lfo(800, 400).speed(2).wave("sawtooth").norm()`

**Testing:**

- [x] `d.lfo(800, 400).getSchema()` produces valid schema
- [x] `d.lfo([600, 800], 400).getSchema()` — `outputA` is cycling `StaticSchema`

---

### Step 3.3 — Update `Filter` to accept `Lfo`

**Files:** `packages/fluid/src/effects/filter.ts`, `packages/fluid/src/utils/validate.ts`

Add `isLfoTuple` to `validate.ts`:

```ts
function isLfoTuple(v: unknown[]): v is [Lfo] {
  return v.length === 1 && v[0] instanceof Lfo;
}
```

Update `Filter` constructor and all parameter methods (`q`, `detune`, `gain`) to accept `Lfo`:

```ts
private _frequency: Parameter | Envelope | Lfo;

constructor(type: FilterType, ...frequency: CycleInput | [Envelope] | [Lfo]) {
  if (isLfoTuple(frequency)) {
    this._frequency = frequency[0];
  } else if (isEnvelopeTuple(frequency)) {
    this._frequency = frequency[0];
  } else {
    this._frequency = new Parameter(...frequency);
  }
}
```

Same pattern for `q()`, `detune()`, `gain()`.

**Acceptance criteria:**

- [x] `d.lpf(d.lfo(400, 1200).norm())` compiles and produces correct schema
- [x] Existing `Parameter` and `Envelope` inputs still work unchanged
- [x] `filter.getSchema()` correctly serializes `LfoSchema` on any parameter

**Testing:**

- [x] Filter with LFO on frequency: schema has `type: "lfo"` on `frequency` field
- [x] Filter with LFO on q: schema has `type: "lfo"` on `q` field
- [x] Existing filter tests still pass

---

### Step 3.4 — Update `Instrument.detune()` to accept `Lfo`

**Files:** `packages/fluid/src/instruments/instrument.ts`

Widen `_detune` to `Parameter | Envelope | Lfo` and update the `.detune()` method:

```ts
detune(...input: CycleInput | [Envelope] | [Lfo]) {
  if (isLfoTuple(input)) {
    this._detune = input[0];
  } else if (isEnvelopeTuple(input)) {
    this._detune = input[0];
  } else {
    this._detune = new Parameter(...input);
  }
  return this;
}
```

**Acceptance criteria:**

- [x] `.detune(d.lfo(0, 100))` produces `LfoSchema` on the detune field
- [x] Existing `Parameter` and `Envelope` detune inputs still work

**Testing:**

- [x] `.detune(d.lfo(0, 100)).getSchema()` — detune has `type: "lfo"`
- [x] `.detune(100)` — detune still has `type: "static"`
- [x] `.detune(d.env(0, 100))` — detune still has `type: "envelope"`

---

### Step 3.5 — Implement Gain effect

**Files:** `packages/fluid/src/effects/gain.ts` (new)

```ts
class GainEffect {
  private _gain: Parameter | Envelope | Lfo;

  constructor(input: CycleInput | Envelope | Lfo) {
    // Determine type and store
  }

  getSchema(): GainEffectSchema {
    return {
      type: "gain",
      gain: this._gain.getSchema(),
    };
  }
}
```

**Files:** `packages/fluid/src/index.ts`

Add `d.gain()` to `Drome`:

```ts
gain(input: number | number[] | RandomCycle | Envelope | Lfo) {
  return new GainEffect(input);
}
```

**Files:** `packages/fluid/src/instruments/instrument.ts`

Widen `.fx()` to accept `GainEffect` alongside `Filter`:

```ts
fx(...effects: (Filter | GainEffect)[]) {
  this._effects.push(...effects);
  return this;
}
```

Update `_effects` field type accordingly.

**Acceptance criteria:**

- [x] `d.gain(0.5)` produces a `GainEffectSchema` with a static parameter
- [x] `d.gain(d.lfo(0, 1).norm())` produces a `GainEffectSchema` with an `LfoSchema`
- [x] `d.gain(d.env(0, 1))` produces a `GainEffectSchema` with an `EnvelopeSchema`
- [x] `.fx(d.gain(...))` works alongside `.fx(d.lpf(...))`
- [x] Synth schema output includes gain effects in the `effects` array

**Testing:**

- [x] `d.gain(0.5).getSchema()` → `{ type: "gain", gain: { type: "static", ... } }`
- [x] `d.gain(d.lfo(0, 1).norm()).getSchema()` → `{ type: "gain", gain: { type: "lfo", ... } }`
- [x] Synth with mixed effects: `d.synth().fx(d.lpf(800), d.gain(0.5)).getSchema()` — effects array has both types

---

## Phase 4: Audio engine — worklet registration and LFO node management

### Step 4.1 — Add `@web-audio/worklets` as a dependency

**Files:** `packages/audio-engine/package.json`

Add `@web-audio/worklets` to dependencies:

```json
"dependencies": {
  "@web-audio/clock": "workspace:*",
  "@web-audio/schema": "workspace:*",
  "@web-audio/worklets": "workspace:*"
}
```

**Acceptance criteria:**

- [ ] `pnpm install` succeeds
- [ ] Audio engine can import from `@web-audio/worklets`

---

### Step 4.2 — Worklet registration in `AudioEngine`

**Files:** `packages/audio-engine/src/index.ts`

The `AudioEngine` needs to register the worklet module before any LFO nodes can be created. This is an async operation that should happen once.

```ts
private _workletReady: Promise<void> | null = null;

private _ensureWorklet(): Promise<void> {
  if (!this._workletReady) {
    const blob = new Blob([lfoProcessorSource], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    this._workletReady = this._ctx.audioWorklet.addModule(url);
  }
  return this._workletReady;
}
```

The `_commit()` method needs to await this before creating `Synthesizer` instances that may contain LFOs. Alternatively, register the worklet eagerly in the constructor.

**Acceptance criteria:**

- [ ] Worklet module is registered before any LFO nodes are created
- [ ] Registration happens only once per `AudioEngine` instance
- [ ] Non-LFO schemas still work without waiting for worklet registration

**Testing:**

- [ ] Engine creates successfully and can register the worklet module

---

### Step 4.3 — LFO node creation and storage in `Instrument`

**Files:** `packages/audio-engine/src/instrument.ts`

Add LFO node management to the `Instrument` base class:

```ts
protected _lfoNodes = new Map<string, AudioWorkletNode>();

protected _createLfoNode(schema: LfoSchema): AudioWorkletNode {
  const node = new AudioWorkletNode(this._ctx, "lfo-processor", {
    parameterData: {
      outputA: /* resolve initial value */,
      outputB: /* resolve initial value */,
    },
    processorOptions: {
      waveform: schema.waveform,
      speed: schema.speed,
      phase: schema.phase,
      norm: schema.norm,
      barDuration: this._clock.barDuration,
    },
  });
  this._lfoNodes.set(schema.id, node);
  return node;
}
```

Add a method to scan a schema for LFO parameters and create nodes:

```ts
protected _initLfos(schema: SynthesizerSchema): void {
  // Check detune
  if (schema.detune.type === "lfo") this._createLfoNode(schema.detune);
  // Check effects
  for (const effect of schema.effects) {
    if (effect.type === "filter") {
      for (const param of [effect.frequency, effect.q, effect.detune, effect.gain]) {
        if (param.type === "lfo") this._createLfoNode(param);
      }
    } else if (effect.type === "gain") {
      if (effect.gain.type === "lfo") this._createLfoNode(effect.gain);
    }
  }
}
```

**Acceptance criteria:**

- [ ] LFO nodes are created for every `LfoSchema` in the instrument's schema
- [ ] Nodes are stored by `id` in the map
- [ ] `AudioWorkletNode` is created with correct `parameterData` and `processorOptions`
- [ ] LFO nodes are connected to `this._outputNode` (they need to be in the audio graph to process)

**Testing:**

- [ ] Mock-based unit test: `_initLfos` creates the correct number of nodes for a schema with LFOs on multiple parameters

---

### Step 4.4 — Connect LFO nodes to per-note parameters

**Files:** `packages/audio-engine/src/synthesizer.ts`

In `_scheduleNote`, when building effect nodes, check if a parameter is an LFO and connect the pre-existing worklet node instead of scheduling an envelope or static value:

```ts
// In _buildEffectNode or _scheduleNote:
if (schema.type === "lfo") {
  const lfoNode = this._lfoNodes.get(schema.id);
  if (lfoNode) lfoNode.connect(param);
} else if (schema.type === "envelope") {
  this._scheduleParamEnvelope(param, schema, ...);
} else {
  param.setValueAtTime(this._resolve(schema, barIndex, stepIndex), startTime);
}
```

Same pattern for detune on the oscillator.

**Acceptance criteria:**

- [ ] LFO worklet node is connected to the correct `AudioParam` on each note's filter/oscillator
- [ ] Multiple notes' params all receive the same LFO signal (fan-out)
- [ ] Envelope and static parameter handling is unchanged
- [ ] Connections are cleaned up when notes end (automatic via node GC)

**Testing:**

- [ ] Manual: `d.synth().fx(d.lpf(d.lfo(400, 1200).norm()))` produces an audible filter sweep
- [ ] Manual: `d.synth().detune(d.lfo(0, 100))` produces audible vibrato

---

### Step 4.5 — Handle `GainEffectSchema` in `_buildEffectNode`

**Files:** `packages/audio-engine/src/instrument.ts`

Add a case for `"gain"` in `_buildEffectNode`:

```ts
case "gain": {
  const node = new GainNode(this._ctx);
  const schema = effect.gain;
  if (schema.type === "lfo") {
    const lfoNode = this._lfoNodes.get(schema.id);
    if (lfoNode) lfoNode.connect(node.gain);
  } else if (schema.type === "envelope") {
    this._scheduleParamEnvelope(node.gain, schema, barIndex, stepIndex, noteDuration, endTime);
  } else {
    node.gain.setValueAtTime(this._resolve(schema, barIndex, stepIndex), startTime);
  }
  return node;
}
```

**Acceptance criteria:**

- [ ] `GainEffectSchema` creates a `GainNode` in the effects chain
- [ ] LFO on gain effect produces tremolo
- [ ] Envelope and static values on gain effect work correctly
- [ ] Gain effect integrates correctly in the `osc → gain → effects → destination` chain

**Testing:**

- [ ] Manual: `d.synth().fx(d.gain(d.lfo(0, 1).norm().speed(4)))` produces audible tremolo
- [ ] Manual: `d.synth().fx(d.gain(0.5))` reduces volume by half

---

### Step 4.6 — Per-bar `outputA`/`outputB` scheduling

**Files:** `packages/audio-engine/src/synthesizer.ts`

In `scheduleBar`, before scheduling notes, update any LFO nodes' `AudioParam`s for the current bar:

```ts
scheduleBar(barIndex: number, barStartTime: number): void {
  // Update LFO AudioParams for this bar
  this._updateLfoParams(barIndex, barStartTime);

  // ... existing note scheduling
}

private _updateLfoParams(barIndex: number, barStartTime: number): void {
  // For each LFO schema in the instrument, resolve outputA/outputB
  // and schedule them on the worklet node's AudioParams
  for (const [id, schema] of this._lfoSchemas) {
    const node = this._lfoNodes.get(id);
    if (!node) continue;
    const outputA = this._resolve(schema.outputA, barIndex, 0);
    const outputB = this._resolve(schema.outputB, barIndex, 0);
    node.parameters.get("outputA")!.setValueAtTime(outputA, barStartTime);
    node.parameters.get("outputB")!.setValueAtTime(outputB, barStartTime);
  }
}
```

This requires storing the LFO schemas alongside the nodes. Add a `_lfoSchemas: Map<string, LfoSchema>` alongside `_lfoNodes`.

**Acceptance criteria:**

- [ ] `outputA` and `outputB` `AudioParam`s are updated at each bar boundary
- [ ] Cycling values change per bar: `d.lfo([600, 800, 1000], 400)` shifts baseline each bar
- [ ] Random values resolve differently each bar

**Testing:**

- [ ] Manual: `d.synth().fx(d.lpf(d.lfo([400, 800, 1200], 200).norm()))` — audible change in filter center per bar

---

### Step 4.7 — LFO node cleanup

**Files:** `packages/audio-engine/src/instrument.ts`

When an instrument is retired (via `cancelFutureNotes` or when `done` resolves), disconnect and clean up LFO nodes:

```ts
private _cleanupLfos(): void {
  for (const node of this._lfoNodes.values()) {
    node.disconnect();
  }
  this._lfoNodes.clear();
}
```

Call this in `cancelFutureNotes` and when the instrument is done.

**Acceptance criteria:**

- [ ] LFO worklet nodes are disconnected when the instrument is retired
- [ ] No LFO nodes leak across schema commits
- [ ] The `_lfoNodes` map is cleared

**Testing:**

- [ ] After `cancelFutureNotes()`, `_lfoNodes` is empty
- [ ] Updating the schema (triggering `_commit()`) replaces LFO nodes cleanly

---

## Phase 5: Integration tests and verification

### Step 5.1 — Schema round-trip tests

**Files:** `packages/fluid/src/index.test.ts`

Test complete schema output from `Drome` for LFO configurations:

- [ ] Synth with LFO on detune → `detune` field has `type: "lfo"` with correct values
- [ ] Synth with LFO filter → effect's frequency field has `type: "lfo"`
- [ ] Synth with gain effect → effects array includes `{ type: "gain", ... }`
- [ ] Synth with mixed effects (filter + gain) → both present in effects array
- [ ] LFO with all options: `.speed(2, 1).wave("sawtooth", "triangle").offset(0.25).norm()`
- [ ] Two filters using the same `Lfo` variable → two different `id` values in schema

---

### Step 5.2 — Manual audio verification

Using the sequencer app, verify the following produce correct audio output:

- [ ] `d.synth("sine").notes("C4").fx(d.lpf(d.lfo(400, 1200).norm())).push()` — filter sweep, 1 bar period
- [ ] `d.synth("sine").notes("C4").fx(d.lpf(d.lfo(800, 400).speed(4))).push()` — fast wobble
- [ ] `d.synth("sine").notes("C4").fx(d.lpf(d.lfo(800, 400).wave("sawtooth"))).push()` — sawtooth sweep
- [ ] `d.synth("sine").notes("C4").fx(d.gain(d.lfo(0, 1).norm().speed(4))).push()` — tremolo
- [ ] `d.synth("sine").notes("C4").detune(d.lfo(0, 100).speed(8)).push()` — vibrato
- [ ] `d.synth("sine").notes("C4").fx(d.lpf(d.lfo(400, 1200).norm().speed(0.5))).push()` — slow 2-bar sweep
- [ ] `d.synth("sine").notes("C4").fx(d.lpf(d.lfo([400, 800], [400, 1200]).norm())).push()` — cycling values per bar

---

## File Change Summary

| File                                                | Change                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/schema/src/index.ts`                      | Add `LfoSchema`, `GainEffectSchema`, widen parameter types       |
| `packages/worklets/`                                | New package                                                      |
| `packages/worklets/src/processors/lfo-processor.ts` | New — `LfoProcessor` AudioWorkletProcessor                       |
| `packages/worklets/src/index.ts`                    | Export `lfoProcessorSource` string                               |
| `packages/fluid/src/automations/lfo.ts`             | New — `Lfo` builder class                                        |
| `packages/fluid/src/effects/gain.ts`                | New — `GainEffect` class                                         |
| `packages/fluid/src/effects/filter.ts`              | Accept `Lfo` on all parameters                                   |
| `packages/fluid/src/instruments/instrument.ts`      | Accept `Lfo` on detune, widen `.fx()` to accept `GainEffect`     |
| `packages/fluid/src/utils/validate.ts`              | Add `isLfoTuple`                                                 |
| `packages/fluid/src/index.ts`                       | Add `d.lfo()`, `d.gain()`                                        |
| `packages/audio-engine/package.json`                | Add `@web-audio/worklets` dependency                             |
| `packages/audio-engine/src/index.ts`                | Worklet registration                                             |
| `packages/audio-engine/src/instrument.ts`           | LFO node creation, storage, cleanup, `GainEffectSchema` handling |
| `packages/audio-engine/src/synthesizer.ts`          | LFO connection in `_scheduleNote`, per-bar param updates         |

## Verification

After all phases:

1. `pnpm --filter @web-audio/schema exec tsc --noEmit` — schema types clean
2. `pnpm --filter @web-audio/worklets exec vitest run` — worklet tests pass
3. `pnpm --filter @web-audio/fluid exec vitest run` — fluid tests pass
4. `pnpm --filter @web-audio/audio-engine exec vitest run` — engine tests pass
5. Manual demo in the sequencer app — verify audible LFO modulation on filter, gain, and detune

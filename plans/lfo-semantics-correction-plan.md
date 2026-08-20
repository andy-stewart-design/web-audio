# LFO Semantics and Lifecycle Correction Plan

## Context

The current LFO implementation has two independent correctness problems:

1. Web Audio sums a connected signal with an `AudioParam`'s intrinsic value, but the LFO worklet already produces the complete intended parameter value.
2. The current normalized output formula does not match the original user-facing `.norm()` contract.

There is also an ownership gap: per-voice LFO parameter edges are connected but not explicitly disconnected when their voice ends.

This work should be implemented independently of buses, routing, persistent automation, or parameter-management extraction.

## Intended contract

The original API proposal in [`notes/lfo-prompt.md`](../notes/lfo-prompt.md) defines two modes.

### Default mode: baseline and offset

```ts
d.lfo(800, 400);
```

```text
output = baseline + offset × bipolarWave
bipolarWave ∈ [-1, 1]
range = [400, 1200]
```

### Normalized mode: minimum and maximum

```ts
d.lfo(400, 1200).norm();
```

```text
unipolarWave = (bipolarWave + 1) / 2
output = min + (max - min) × unipolarWave
range = [400, 1200]
```

The completed LFO PRD contains conflicting examples: its prose says normalized arguments are min/max, while one formula treats the second argument as a range. This SOW resolves that ambiguity in favor of the original user-facing proposal: `.norm()` means **minimum and maximum**.

### AudioParam connection semantics

The LFO worklet emits the complete target value. Because Web Audio calculates:

```text
effective parameter value = intrinsic value + connected signal values
```

the target `AudioParam` intrinsic value must be set to `0` before connecting the LFO.

Examples of the current unintended offsets include:

- filter frequency defaulting to `350` and shifting an intended `400…1200` sweep to `750…1550`;
- gain defaulting to `1` and shifting intended `0…1` tremolo to `1…2`;
- Q defaulting to `1` and shifting its intended modulation range.

Oscillator and buffer-source detune are often already initialized to `0` for an LFO, but they should use the same explicit connection behavior as every other target.

## Goals

- Make LFO output match the documented baseline/offset and min/max contracts.
- Remove target-native-default offsets from effective LFO values.
- Explicitly own every per-voice LFO-to-parameter edge.
- Clean edges when their voice ends, is cancelled before starting, or is destroyed.
- Never disconnect an active voice's LFO merely because transport Stop was pressed.
- Preserve existing phase synchronization, waveform generation, slew limiting, speed cycling, and bar-bound updates.

## Non-goals

- Bus automation
- A reusable `ParameterManager`
- Refactoring parameter resolution out of `Instrument`
- Shared LFOs across instruments
- LFO and envelope composition
- Live BPM changes for existing LFO nodes
- General hard-stop de-clicking
- Changing waveform shapes, phase synchronization, or square-wave slew behavior
- Changing Fluid builder syntax or serialized schema fields

---

## Step 1 — Lock the worklet output contract with tests

**Files:** `packages/worklets/src/processors/lfo-processor.ts`, a focused worklet output utility/test or processor test

Introduce a small, directly testable output calculation or equivalent processor-level test coverage.

Assert representative waveform values for both modes.

### Default mode

For `outputA = 800`, `outputB = 400`:

```text
wave = -1 → 400
wave =  0 → 800
wave =  1 → 1200
```

### Normalized mode

For `outputA = 400`, `outputB = 1200`:

```text
wave = -1 → 400
wave =  0 → 800
wave =  1 → 1200
```

Also cover:

- negative baseline/offset values;
- equal normalized bounds;
- inverted waveforms, which should traverse the same range in reverse;
- output values evaluated after slew limiting, since the formula consumes the slewed waveform value.

Requirements:

- Keep output calculation sample-safe and allocation-free inside `process()`.
- Do not change absolute-time phase synchronization.
- Do not change `outputA`/`outputB` schema names in this SOW.
- Make the min/max interpretation explicit in comments and public documentation.

**Acceptance criteria:**

- [x] Tests demonstrate the current normalized formula's incorrect upper bound.
- [x] Default mode remains baseline plus bipolar offset.
- [x] Normalized mode becomes interpolation from min to max.
- [x] Existing waveform, phase-sync, and worklet packaging tests pass.

---

## Step 2 — Neutralize LFO target intrinsic values

**Files:** `packages/audio-engine/src/instruments/instrument.ts`, focused instrument tests

Create one narrow internal connection helper, for example:

```ts
private _connectLfo(
  param: AudioParam,
  schema: LfoSchema,
  cleanups: (() => void)[],
) {
  const node = this._lfoNodes.get(schema.id);
  if (!node) return;

  param.value = 0;
  node.connect(param);
  // Register owned edge cleanup in Step 3.
}
```

Use it for every per-voice LFO target:

- oscillator detune;
- buffer-source detune;
- filter frequency;
- filter Q;
- filter detune;
- filter gain;
- gain-effect gain;
- future instrument parameters routed through the existing LFO branch.

Requirements:

- Set `param.value = 0` before `node.connect(param)`.
- Do not neutralize static, random, envelope, or MIDI-controlled parameters.
- Do not alter `_resolveDetune()` values for non-LFO schemas.
- Keep this helper inside the existing `Instrument` implementation; do not introduce a general parameter host.

Tests must assert the effective model, not only that `connect()` was called:

```text
intrinsic 0 + LFO output = intended value
```

Use non-zero fake native defaults for gain, frequency, Q, filter gain, and detune so regressions remain visible.

**Acceptance criteria:**

- [ ] Every LFO-controlled target has intrinsic value `0` before connection.
- [ ] Gain `d.lfo(0, 1).norm()` has an effective `0…1` range rather than `1…2`.
- [ ] Filter `d.lfo(400, 1200).norm()` has an effective `400…1200` range rather than including native frequency offset.
- [ ] Static, envelope, and MIDI parameter tests remain unchanged.

---

## Step 3 — Own per-voice LFO edges without breaking Stop

**Files:** `packages/audio-engine/src/instruments/instrument.ts`, `packages/audio-engine/src/types.ts`, instrument lifecycle tests

The current `ScheduledNote.midiBindings` name is too narrow once it owns LFO edges. Rename it to a voice-scoped concept such as:

```ts
interface ScheduledNote {
  sourceNode: AudioScheduledSourceNode;
  audioNodes: AudioNode[];
  completionCleanups: (() => void)[];
  startTime: number;
}
```

The collection may contain:

- per-voice MIDI binding cleanup;
- per-voice LFO parameter-edge cleanup;
- future resources whose lifetime exactly matches that voice.

### LFO edge cleanup

After connecting an edge, register an idempotent cleanup:

```ts
let connected = true;
completionCleanups.push(() => {
  if (!connected) return;
  connected = false;
  node.disconnect(param);
});
```

### Voice completion

When `sourceNode.onended` fires:

1. disconnect the source and voice audio nodes;
2. execute completion cleanups;
3. remove the scheduled voice;
4. evaluate instrument retirement completion.

### Future-note cancellation

In `cancelFutureNotes()`, check timing before executing voice cleanup:

```ts
for (const note of this._scheduled) {
  if (note.startTime <= now) continue;

  note.completionCleanups.forEach((cleanup) => cleanup());
  // Stop and disconnect the future voice.
}
```

This is essential. Stop must not execute LFO edge cleanup for a voice that has already started and may still be audible.

### Destruction

Instrument destruction executes every remaining voice's completion cleanups before clearing voice state and destroying shared LFO nodes.

Requirements:

- Edge cleanup is idempotent.
- Shared instrument LFO nodes remain alive while any voice or the active instrument may use them.
- Retiring instruments disconnect shared LFO nodes only after all scheduled voices finish.
- Destroy may terminate active voices and clean their edges immediately.
- Do not depend on garbage collection to remove incoming LFO connections.

**Acceptance criteria:**

- [ ] Voice end disconnects each LFO edge exactly once.
- [ ] Cancelling a future voice disconnects its LFO edges exactly once.
- [ ] Stop does not disconnect an active voice's LFO edges.
- [ ] Destroy disconnects active and future voice edges before shared LFO nodes.
- [ ] Retirement waits for voices, then cleans the shared LFO nodes.
- [ ] MIDI subscription cleanup retains its existing voice lifecycle behavior except that active bindings are no longer removed by future-note cancellation.

---

## Step 4 — Add focused compatibility fixtures

**Files:** AudioEngine instrument tests, worklet tests, and a small documented manual fixture

Create inspectable before/after fixtures for:

- oscillator detune;
- buffer-source detune;
- filter frequency;
- filter Q;
- filter gain;
- gain-effect gain.

For each target, record:

```text
configured LFO output
native AudioParam default
old effective range
corrected effective range
```

Representative cases:

```ts
d.lfo(800, 400);
d.lfo(400, 1200).norm();
d.lfo(0, 1).norm();
d.lfo(0, 100);
```

Include a Stop regression fixture with a sustained voice and prominent filter or detune LFO. Verify that pressing Stop does not remove modulation from the already audible voice.

Requirements:

- Automated tests must pass before listening.
- Do not start a development server or browser session without permission.
- Keep the semantic formula correction independently revertible from lifecycle cleanup where practical.

**Acceptance criteria:**

- [ ] Before/after ranges are visible in automated fixtures.
- [ ] A representative set of existing LFO sketches is reviewed manually.
- [ ] Filter sweep, tremolo, Q/filter-gain modulation, and vibrato match configured ranges.
- [ ] Stop produces no branch-specific click caused by disconnecting active LFO edges.
- [ ] Any sketch relying on the old accidental native offset is documented as a compatibility break rather than silently preserved.

---

## Step 5 — Documentation and closeout

**Files:** public LFO documentation and completed/deferred notes where semantics are described

Document:

- default arguments as baseline and bipolar offset;
- `.norm()` arguments as minimum and maximum;
- LFO output as the complete target value, not an additive modulation amount;
- target intrinsic neutralization as an engine implementation detail;
- free-running phase behavior across voices;
- Stop and voice-completion lifecycle semantics.

Correct contradictory examples that describe normalized mode as min/max while passing a range as the second argument.

Do not rewrite historical documents solely to erase prior decisions; add a correction note where preserving history is useful.

**Acceptance criteria:**

- [ ] Public examples and formulas agree.
- [ ] No example implies that `.norm()` takes minimum plus range.
- [ ] Lifecycle documentation distinguishes active voice completion from future-note cancellation.
- [ ] Changed package format, test, check, lint, and build commands pass.
- [ ] Workspace checks pass.

## Required focused verification

### Worklets

- Output formula at `-1`, `0`, and `1`
- Normalized min/max interpolation
- Inversion range preservation
- Existing waveform and source packaging behavior

### AudioEngine

- Intrinsic neutralization for every LFO target type
- Effective-value fixtures
- Voice-end edge cleanup
- Future-note cancellation cleanup
- Active-note Stop regression
- Instrument retirement cleanup
- Immediate destruction cleanup
- Existing MIDI subscription behavior
- Existing phase-origin and per-bar bound updates

### Commands

Run formatting for changed files, followed by available package commands:

```sh
pnpm --filter @web-audio/worklets test:ci
pnpm --filter @web-audio/worklets check
pnpm --filter @web-audio/worklets lint
pnpm --filter @web-audio/worklets build

pnpm --filter @web-audio/audio-engine test:ci
pnpm --filter @web-audio/audio-engine check
pnpm --filter @web-audio/audio-engine lint
pnpm --filter @web-audio/audio-engine build

pnpm check
pnpm lint
pnpm test
```

## Completion criteria

This correction is complete when:

- default and normalized LFO formulas match the documented API;
- target native defaults no longer shift LFO output;
- every per-voice LFO edge has explicit ownership;
- Stop preserves active voice modulation while cancelling future voices;
- voice end, cancellation, retirement, and destruction clean resources exactly once;
- focused automated and audible reviews approve the corrected behavior;
- no bus, routing, parameter-manager, or unrelated engine lifecycle work is included.

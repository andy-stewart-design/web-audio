# Shared Popover — Phased Implementation Plan

## Source specification

This plan implements [`popover-prd.md`](popover-prd.md). The PRD remains authoritative for the intended public API, semantics, focus policy, positioning behavior, migration scope, and non-goals.

## Current code

Relevant existing files:

- `apps/web/src/components/login-button/index.svelte`
- `apps/web/src/components/login-button/profile-popover.svelte`
- `apps/web/src/components/login-button/utils.ts`
- `apps/web/src/components/midi-control/index.svelte`
- `apps/web/src/components/core/button/index.svelte`
- `apps/web/src/components/core/switch/index.svelte`
- `apps/web/vite.config.ts`

The web app already depends on `@floating-ui/dom` and already has a Chromium-backed Vitest browser project using `vitest-browser-svelte`. No package installation or test-runner setup should be necessary.

## Implementation principles

- Complete and verify each phase before beginning the next.
- Keep the shared component visually headless. It may supply only structural positioning styles.
- Keep trigger and panel markup consumer-owned through symmetrical snippets and actions.
- Prefer browser tests for native Popover API, focus, and geometry behavior.
- Do not add a native Popover API fallback.
- Do not run the development server without approval.
- Preserve existing profile and MIDI presentation during migration.

---

## Phase 1 — Establish the headless component contract

### Goal

Create the shared component shell with typed props, snippets, actions, generated semantics, and mounted consumer-owned elements. This phase establishes the API without yet implementing the complete native lifecycle, positioning, or focus policy.

### Files

Create:

- `apps/web/src/components/core/popover/index.svelte`
- `apps/web/src/components/core/popover/popover-test.svelte` or an equivalently named test fixture
- `apps/web/src/components/core/popover/index.svelte.test.ts`

### Implementation

1. Define the component props:
   - required `ariaLabel`;
   - optional `id`;
   - optional constrained `role`;
   - optional `placement`, `offset`, and `collisionPadding` defaults;
   - bindable `open`, defaulting to `false`;
   - required `trigger` and `content` snippets.
2. Generate a hydration-safe default panel ID using `$props.id()` when `id` is omitted.
3. Define a `trigger` action restricted to `HTMLButtonElement`.
4. Define a `popover` action accepting a suitable panel `HTMLElement`.
5. Define an optional `initialFocus` action accepting a focusable `HTMLElement`.
6. Register and clean up the corresponding element references when actions mount and unmount.
7. Render both snippets unconditionally so trigger and panel remain mounted while closed.
8. Pass trigger attributes through `props`:
   - `aria-expanded`;
   - `aria-controls`;
   - `aria-haspopup` derived from the effective role.
9. Pass panel attributes through `props`:
   - generated or explicit `id`;
   - `popover="auto"`;
   - effective role;
   - `aria-label`;
   - `tabindex="-1"`;
   - `data-open`;
   - required structural positioning styles.
10. Add development-only warnings if more than one live trigger or panel registers with one component instance. Do not warn when an old action is destroyed before a replacement registers.
11. Supply a placeholder `close(restoreFocus = true)` function through the content snippet with a signature that later phases can complete.

Keep exact snippet and action types local to the component. Avoid explicit return types where inference is sufficient.

### Automated verification

Add browser component tests that verify:

- Trigger and panel snippets render simultaneously while closed.
- The default role is `dialog`.
- An allowed explicit role is reflected in the panel and trigger `aria-haspopup`.
- `ariaLabel` becomes the panel's accessible label.
- Generated `aria-controls` and panel `id` match.
- An explicit `id` overrides the generated ID.
- Initial `open` is reflected by `aria-expanded` and `data-open`.
- Structural positioning values are present without imposing visual styles.

Run:

```text
pnpm --filter web check
pnpm --filter web test
```

### Acceptance criteria

- The proposed snippet API compiles with `use:trigger`, `use:popover`, and `use:initialFocus`.
- The trigger action rejects non-button elements at type-check time.
- The panel is consumer-owned and remains mounted while closed.
- Required semantics and ID relationships are generated correctly.
- The component contains no profile- or MIDI-specific markup or styling.
- Phase 1 browser tests and `svelte-check` pass.

---

## Phase 2 — Implement native popover lifecycle and bindable state

### Goal

Make the trigger, native `popover="auto"` state, `close()` API, and optional `bind:open` work bidirectionally without adding custom light-dismiss behavior.

### Files

Update:

- `apps/web/src/components/core/popover/index.svelte`
- `apps/web/src/components/core/popover/index.svelte.test.ts`
- The test fixture as needed

### Implementation

1. Have the trigger action listen for click activation and call the panel's native `showPopover()` or `hidePopover()` method.
2. Listen to the panel's native popover lifecycle event (`toggle`, with `beforetoggle` only if needed) and treat native state as authoritative after transitions.
3. Synchronize `open` from native state changes, including:
   - trigger activation;
   - Escape;
   - light dismissal;
   - another `popover="auto"` opening.
4. React to external changes to bound `open` by showing or hiding the registered panel.
5. Guard synchronization so effects and native events do not produce show/hide loops or invalid-state exceptions.
6. Handle initial `open={true}` after actions mount and hydration completes.
7. Complete `close(restoreFocus = true)` so it hides the native panel and records the focus-restoration intent for Phase 4.
8. Ensure trigger and panel action destruction removes native event listeners and leaves no pending state synchronization.
9. Do not implement manual outside-click or Escape dismissal listeners. Native `popover="auto"` owns dismissal.

### Automated verification

Extend browser tests to verify:

- Clicking the trigger opens the native panel.
- Clicking the trigger again closes it.
- `aria-expanded`, `data-open`, and bound `open` track the actual native state.
- Initial `open={true}` opens after mount.
- Changing bound `open` externally opens and closes the panel.
- Calling `close()` closes the panel.
- Pressing Escape closes the panel and updates bound state.
- Clicking outside light-dismisses the panel and updates bound state.
- Opening a second auto popover dismisses the first.

Run:

```text
pnpm --filter web check
pnpm --filter web test
```

### Acceptance criteria

- Native Popover API state and bindable Svelte state stay synchronized in both directions.
- Trigger activation and `close()` work without consumers supplying event handlers.
- Native Escape and light dismissal work without duplicate custom dismissal logic.
- The panel remains mounted after closing.
- Phase 1 and Phase 2 tests pass.

---

## Phase 3 — Add Floating UI positioning and lifecycle cleanup

### Goal

Anchor the native top-layer panel to the trigger with collision-aware, continuously updated positioning.

### Files

Update:

- `apps/web/src/components/core/popover/index.svelte`
- `apps/web/src/components/core/popover/index.svelte.test.ts`
- The test fixture as needed

### Implementation

1. Import `computePosition`, `autoUpdate`, `offset`, `flip`, and `shift` from `@floating-ui/dom`.
2. Position with:
   - `strategy: 'fixed'`;
   - configured `placement`;
   - `offset(offsetDistance)`;
   - `flip()`;
   - `shift({ padding: collisionPadding })`.
3. Apply computed `left` and `top` coordinates to the registered panel.
4. Start `autoUpdate()` only when:
   - the native popover is open;
   - both trigger and panel are registered.
5. Stop the updater when:
   - the popover closes;
   - either action is destroyed;
   - the component is destroyed;
   - positioning inputs change and the updater is replaced.
6. Make placement, offset, and collision-padding prop changes take effect without remounting the component.
7. Keep structural positioning styles in panel `props`; do not add consumer-facing visual styles.

### Automated verification

Extend browser tests to verify:

- Opening applies finite `left` and `top` coordinates.
- The default placement positions the panel below and end-aligned with the trigger when space permits.
- A non-default placement changes the expected relationship.
- Changing offset produces the expected trigger-to-panel separation.
- A panel near a viewport edge flips or shifts so it remains within collision padding.
- Moving or resizing the reference while open causes coordinates to update.
- Closing stops further positioning updates.

Geometry assertions should allow a small pixel tolerance to avoid browser rounding failures.

Run:

```text
pnpm --filter web check
pnpm --filter web test
```

### Acceptance criteria

- The panel follows the trigger while open.
- Flip and shift behavior prevent avoidable viewport overflow.
- Positioning configuration props work as documented.
- No manual resize or scroll listeners are introduced.
- `autoUpdate()` is reliably cleaned up.
- All tests through Phase 3 pass.

---

## Phase 4 — Implement focus entry and restoration policy

### Goal

Complete keyboard focus behavior for opening and every supported dismissal path without trapping focus.

### Files

Update:

- `apps/web/src/components/core/popover/index.svelte`
- `apps/web/src/components/core/popover/index.svelte.test.ts`
- The test fixture as needed

### Implementation

1. After native opening and DOM readiness, focus in this order:
   1. the live element registered by `use:initialFocus`;
   2. the first enabled, focusable descendant;
   3. the panel itself.
2. Use a focusable-element query that excludes disabled, hidden, and negative-tab-index descendants where appropriate.
3. Do not trap focus or add focus guards.
4. Track the reason or intent for closure sufficiently to apply this policy:
   - trigger-close: focus already remains on the trigger;
   - Escape: restore focus to the trigger;
   - outside light dismissal: preserve focus on the outside target;
   - `close()`: restore focus to the trigger;
   - `close(false)`: do not restore focus.
5. Observe Escape only if needed to record restoration intent; do not prevent native dismissal.
6. Avoid stealing focus when the trigger or panel has been destroyed before an asynchronous focus step runs.
7. Cancel or invalidate stale scheduled focus work if the panel closes or reopens quickly.

### Automated verification

Extend browser tests to verify:

- `use:initialFocus` takes precedence over DOM order.
- Without an explicit target, the first focusable descendant receives focus.
- Without focusable descendants, the panel receives focus.
- Tab can leave the panel; focus is not trapped.
- Escape restores focus to the trigger.
- Trigger-close leaves focus on the trigger.
- Outside-click dismissal leaves focus on the outside target.
- `close()` restores trigger focus.
- `close(false)` preserves the new/current focus target.
- Closing during a pending opening focus step does not focus hidden or destroyed content.

Run:

```text
pnpm --filter web check
pnpm --filter web test
```

### Manual verification

Using a minimal test page or browser test debugging mode, confirm:

1. Open with Enter and Space from the trigger.
2. Focus enters the panel.
3. Tab and Shift+Tab are not trapped.
4. Escape closes and returns focus to the trigger.
5. Pointer dismissal does not visibly jump focus back to the trigger.

Do not start the app's development server without approval.

### Acceptance criteria

- Focus behavior exactly matches the PRD for all dismissal paths.
- No focus trap or modal semantics are present.
- Stale asynchronous focus work cannot move focus into a closed panel.
- All tests through Phase 4 pass.

---

## Phase 5 — Migrate the profile popover

### Goal

Replace the profile popover's custom behavior and positioning with the shared primitive while preserving login behavior and profile presentation.

### Files

Update as appropriate:

- `apps/web/src/components/login-button/index.svelte`
- `apps/web/src/components/login-button/profile-popover.svelte`
- `apps/web/src/components/login-button/utils.ts`

Add a targeted browser test only if existing primitive coverage cannot validate a profile-specific integration risk.

### Implementation

1. Wrap the authenticated avatar trigger and profile panel in `Popover` with:
   - `ariaLabel="Profile"`;
   - default dialog role;
   - default bottom-end placement.
2. Apply `use:trigger` and spread trigger props onto the existing avatar button.
3. Apply `use:popover` and spread panel props onto the profile panel element.
4. Preserve the existing avatar image/icon, labels, profile information, links, logout control, and visual styles.
5. Remove profile-owned positioning styles now provided structurally by the primitive, while retaining visual panel styles.
6. Use `close(false)` for profile navigation links.
7. Ensure logout closes the panel before or as the logout request begins; retain existing invalidation behavior.
8. Keep the unauthenticated login button and modal login dialog behavior unchanged.
9. Remove from `profile-popover.svelte` and `utils.ts`:
   - `computePosition`/position helpers;
   - native-popover feature detection and fallback classes;
   - resize and scroll listeners;
   - manual Escape and outside-click listeners;
   - profile-specific focus restoration;
   - obsolete popover prop types.
10. Choose the cleanest file boundary:
    - keep profile-specific content/presentation in `profile-popover.svelte` if it can accept the snippet-provided panel contract cleanly;
    - otherwise move the small wrapper/content boundary without duplicating primitive behavior.

### Automated verification

Run:

```text
pnpm --filter web check
pnpm --filter web test
```

If adding integration coverage, verify at least:

- Authenticated avatar opens the labeled profile dialog.
- A profile link closes the panel.
- Logout closes the panel and invokes the existing logout flow.
- Unauthenticated activation still opens the login dialog rather than a popover.

### Manual verification

1. Open the profile popover with pointer and keyboard.
2. Confirm its visual appearance remains equivalent to the current design.
3. Confirm it renders above page stacking contexts and remains attached to the avatar near viewport edges.
4. Confirm initial focus lands on the first profile link.
5. Confirm Escape, trigger-close, outside click, navigation, and logout behave as specified.
6. Confirm the login dialog still opens for an unauthenticated session.

### Acceptance criteria

- The profile feature uses `core/popover` for all popover behavior.
- Existing profile content, styling, navigation, and logout behavior are preserved.
- The login dialog path is unchanged.
- No profile-specific Floating UI, fallback, dismissal, or focus-management implementation remains.
- Type checks and relevant tests pass.

---

## Phase 6 — Migrate the MIDI settings popover

### Goal

Replace the conditionally rendered, absolutely positioned MIDI panel with the shared native/Floating UI primitive while preserving all MIDI functionality and presentation.

### Files

Update:

- `apps/web/src/components/midi-control/index.svelte`

Update child components only if necessary for accessible focus behavior; avoid unrelated MIDI refactors.

### Implementation

1. Wrap the MIDI trigger and panel in `Popover` with:
   - `ariaLabel="MIDI settings"`;
   - default dialog role;
   - default bottom-end placement.
2. Apply `use:trigger` and trigger props to the existing MIDI button.
3. Apply `use:popover` and panel props to the existing MIDI panel.
4. Remove local `open` and `toggle()` state unless another MIDI-specific behavior requires a bound value.
5. Keep the panel mounted while closed; remove `{#if open}` around it.
6. Remove consumer-owned absolute positioning and relative-container dependency now handled by the primitive.
7. Preserve consumer visual styles:
   - responsive width;
   - max block size;
   - overflow;
   - padding;
   - border;
   - radius;
   - background;
   - shadow.
8. Preserve MIDI status, enable/disable behavior, device grouping/listing, ID copying, copied-ID state, and copy-error behavior.
9. Rely initially on first-focusable fallback to focus the MIDI switch. Add an explicit native-element `use:initialFocus` target only if testing shows a better target is necessary.
10. Preserve trigger label and title behavior; let the primitive own `aria-expanded`, `aria-controls`, and `aria-haspopup`.

### Automated verification

Run:

```text
pnpm --filter web check
pnpm --filter web test
```

Add targeted integration coverage if necessary to verify:

- MIDI trigger opens a dialog labeled `MIDI settings`.
- MIDI toggle remains operable after the panel migration.
- Repeated opening preserves panel-local copied/error state according to existing behavior.

### Manual verification

1. Open MIDI settings with pointer and keyboard.
2. Confirm the panel retains its current visual design and responsive width.
3. Confirm the panel flips/shifts near viewport edges and is not clipped by header/layout stacking contexts.
4. Confirm focus enters on the MIDI switch.
5. Toggle MIDI and verify status, device list, and errors still update.
6. Copy a device ID and confirm copied/error feedback still works.
7. Confirm Escape, trigger-close, and outside click follow the shared focus policy.

### Acceptance criteria

- MIDI settings use `core/popover`.
- The panel is always mounted and visibility is controlled by the native Popover API.
- Local absolute-positioning and open-state implementation are removed where obsolete.
- MIDI state and actions behave exactly as before.
- Presentation remains equivalent apart from expected collision-aware placement.
- Type checks and relevant tests pass.

---

## Phase 7 — Cross-consumer behavior, cleanup, and final verification

### Goal

Validate the shared abstraction as a whole, remove obsolete code, and ensure both consumers coexist correctly.

### Files

Review all files changed in Phases 1–6 plus:

- `apps/web/package.json`
- `apps/web/vite.config.ts`

No dependency changes are expected.

### Implementation and cleanup

1. Search for obsolete profile popover helpers, feature detection, fallback classes, and duplicated positioning/dismissal code.
2. Confirm both consumers import the shared primitive from `@/components/core/popover/index.svelte`.
3. Confirm neither consumer overrides structural `position`, `inset`, `margin`, `left`, or `top` unless a documented visual requirement demands it.
4. Confirm all new TypeScript uses inference where practical and contains no `as any` casts.
5. Confirm the implementation does not add:
   - manual light-dismiss listeners;
   - native Popover API fallbacks;
   - focus traps;
   - raw middleware escape hatches;
   - animation coordination;
   - conditional panel unmounting.
6. Format the changed files.

### Automated verification

Run from the repository root:

```text
pnpm --filter web format
pnpm --filter web check
pnpm --filter web lint
pnpm --filter web test
```

If filter-script forwarding behaves differently in the workspace, use the equivalent confirmed commands without running `dev`.

### Manual end-to-end scenarios

#### Scenario 1 — Profile keyboard flow

1. Focus the authenticated avatar.
2. Press Enter.
3. Confirm the profile panel opens and the first link receives focus.
4. Press Escape.
5. Confirm the panel closes and focus returns to the avatar.

#### Scenario 2 — MIDI keyboard flow

1. Focus the MIDI trigger.
2. Press Space.
3. Confirm MIDI settings open and focus enters the switch.
4. Tab through controls and confirm focus is not trapped.
5. Close with Escape and confirm focus returns to the MIDI trigger.

#### Scenario 3 — Pointer light dismissal

1. Open either popover.
2. Click a focusable element outside it.
3. Confirm the panel closes and focus remains on the outside element.

#### Scenario 4 — Auto-popover exclusivity

1. Open the profile popover.
2. Open MIDI settings.
3. Confirm the profile popover closes and MIDI settings remain open.
4. Confirm bound/ARIA open state is correct for both triggers.

#### Scenario 5 — Collision handling

1. Exercise both triggers at narrow viewport sizes and near viewport edges.
2. Confirm panels flip or shift instead of overflowing where space permits.
3. Confirm MIDI content remains scrollable within its max block size.

#### Scenario 6 — Unauthenticated login regression

1. Use an unauthenticated session.
2. Activate the avatar/login button.
3. Confirm the modal login dialog opens and operates as before.

### Final acceptance criteria

- Every acceptance criterion in [`popover-prd.md`](popover-prd.md) is satisfied.
- All browser component tests pass in Chromium.
- Formatting, checks, lint, and tests pass for the web app.
- Profile and MIDI popovers share behavior without sharing visual presentation.
- Opening one auto popover dismisses the other cleanly.
- No obsolete duplicated popover infrastructure remains.
- No unrelated functionality or styling has changed.

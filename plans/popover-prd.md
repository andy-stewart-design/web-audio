# Shared Popover — Product and Technical Specification

## Context

The web app currently has two independently implemented interactive popovers:

- `apps/web/src/components/login-button/profile-popover.svelte` uses Floating UI, the native Popover API when available, and custom dismissal/focus behavior.
- `apps/web/src/components/midi-control/index.svelte` uses a conditionally rendered, absolutely positioned panel without Floating UI or complete popover interaction behavior.

The implementations should share a flexible core primitive without normalizing their distinct visual designs. The primitive is intended for interactive, non-modal popovers such as profile navigation and MIDI settings. Informational tooltips are outside its scope.

## Goals

- Provide one accessible popover interaction model for both existing consumers.
- Let consumers own trigger and panel elements, markup, and visual styling.
- Use Floating UI for viewport-aware positioning.
- Use the native Popover API for top-layer rendering and light dismissal.
- Manage ARIA relationships, open state, focus entry, and focus restoration centrally.
- Keep the API small while allowing controlled state and common placement changes.

## Non-goals

- A shared visual design for all popovers.
- Tooltip behavior.
- Modal behavior or focus trapping.
- Supporting browsers without the native Popover API.
- Arbitrary Floating UI middleware configuration.
- Multiple triggers or panels for one popover instance.
- Coordinated entry or exit animations.
- Conditional unmounting while closed.

## Location

Create the primitive at:

```text
apps/web/src/components/core/popover/index.svelte
```

Keep its implementation and local types in the Svelte file initially. Extract utilities only when they become independently reusable.

## Consumer API

The intended API is symmetrical and headless:

```svelte
<script lang="ts">
	import Popover from '@/components/core/popover/index.svelte';
	import IconMidi from '@/components/icons/icon-midi.svelte';
</script>

<Popover ariaLabel="MIDI settings">
	{#snippet trigger({ trigger, props })}
		<button use:trigger {...props} class="trigger">
			<IconMidi />
		</button>
	{/snippet}

	{#snippet content({ popover, props, close, initialFocus })}
		<div use:popover {...props} class="popover">
			<button use:initialFocus>First action</button>
			<button onclick={() => close()}>Close</button>
			<a href="/elsewhere" onclick={() => close(false)}>Navigate</a>
		</div>
	{/snippet}
</Popover>
```

The trigger must be a native `button`. The panel may be any suitable `HTMLElement`.

### Props

```ts
interface Props {
  ariaLabel: string;
  id?: string;
  role?: "dialog" | "menu" | "listbox" | "tree" | "grid";
  placement?: Placement;
  offset?: number;
  collisionPadding?: number;
  open?: boolean;
  trigger: Snippet;
  content: Snippet;
}
```

Exact snippet generic types should be inferred or declared from their supplied action and prop objects during implementation.

Defaults:

- `role`: `'dialog'`
- `placement`: `'bottom-end'`
- `offset`: `8`
- `collisionPadding`: `8`
- `open`: `false`
- `id`: a hydration-safe value derived from Svelte's `$props.id()`

`open` must be bindable. Consumers that do not bind it receive internally managed state.

## Snippet contracts

### Trigger snippet

The trigger snippet receives:

- `trigger`: a Svelte action restricted to `HTMLButtonElement`.
- `props`: attributes that must be spread onto that button.

The action:

- Registers the Floating UI reference element.
- Opens or closes the native popover on click.
- Retains the element used for focus restoration.
- Cleans up listeners and references when destroyed.

The trigger props include:

- `aria-expanded`
- `aria-controls`
- `aria-haspopup`, derived from the effective panel role

The consumer owns the button's accessible name, visual styles, contents, and unrelated attributes.

### Content snippet

The content snippet receives:

- `popover`: a Svelte action that registers the floating/native popover element.
- `props`: structural and semantic attributes that must be spread onto the panel.
- `close(restoreFocus?: boolean)`: closes the panel; `restoreFocus` defaults to `true`.
- `initialFocus`: a Svelte action that marks the preferred focus target.

The panel props include:

- `id`
- `popover="auto"`
- The effective `role`
- Required `aria-label`
- `aria-modal="false"` if needed for the effective semantics
- `tabindex="-1"` so the panel can be the final focus fallback
- `data-open` for consumer styling
- Essential fixed-position/native-popover reset styles

The primitive supplies only structural styles needed for positioning, including the equivalent of:

```css
position: fixed;
inset: unset;
margin: 0;
```

The positioning action manages `left` and `top`. Consumer classes own width, height, overflow, spacing, colors, borders, radius, shadows, typography, and other visual presentation.

Only one live element may register each of `trigger`, `popover`, and `initialFocus`. The initial-focus action is optional. Development builds should warn if multiple live trigger or panel elements are registered for one instance.

## Native popover behavior

Use `popover="auto"` without a compatibility fallback.

The native API owns:

- Top-layer rendering
- Escape dismissal
- Outside-click/light dismissal
- Closing another auto popover when a new auto popover opens

Listen to native popover lifecycle events to synchronize bindable `open` state, including dismissals initiated by the browser. Programmatic changes to bound `open` must call `showPopover()` or `hidePopover()` once the panel action is registered.

Keep both snippets mounted while the popover is closed. The native closed state controls visibility. This preserves panel-local state and avoids registration, measurement, and focus timing races.

## Positioning

Use `@floating-ui/dom` with:

- `computePosition()`
- `autoUpdate()` while open
- `offset()` using the `offset` prop
- `flip()`
- `shift({ padding: collisionPadding })`
- Fixed positioning strategy

Start `autoUpdate()` after the native panel opens and both elements are registered. Stop it when the panel closes or either action is destroyed.

Do not expose raw Floating UI middleware in the first version. Add an escape hatch only in response to a concrete use case.

## Focus behavior

The primitive is specifically for interactive, non-modal popovers. Focus is not trapped.

### Opening

After the panel opens and its DOM is ready, focus targets in this order:

1. The element registered with `use:initialFocus`.
2. The first enabled, focusable descendant of the panel.
3. The panel itself through `tabindex="-1"`.

Automatic focus entry is mandatory in the first version; there is no `focusOnOpen` option.

### Closing

- Trigger click while open: close while focus remains on the trigger.
- Escape: close and restore focus to the trigger.
- Native outside click: close without stealing focus from the outside target.
- `close()`: close and restore focus to the trigger.
- `close(false)`: close without restoring focus.

The implementation must distinguish explicit/Escape closure from native outside-click dismissal sufficiently to preserve this policy. It may observe Escape solely to record focus intent while leaving actual dismissal to the native Popover API.

Do not set `aria-modal="true"` and do not add focus guards.

## Semantics

`ariaLabel` is required because the panel is an independently announced interactive region.

Default the role to `dialog`. This correctly describes both current panels without imposing the child-role and keyboard requirements of a menu. Consumers may opt into only these roles:

- `dialog`
- `menu`
- `listbox`
- `tree`
- `grid`

A consumer choosing a specialized role is responsible for the corresponding child semantics and keyboard behavior.

Generate a hydration-safe panel ID unless the consumer supplies one. Use it for both the panel `id` and trigger `aria-controls`.

## Existing consumer migration

### Profile popover

Files involved:

- `apps/web/src/components/login-button/index.svelte`
- `apps/web/src/components/login-button/profile-popover.svelte`
- `apps/web/src/components/login-button/utils.ts`

Migration requirements:

- Use the shared primitive with `ariaLabel="Profile"` and the default `dialog` role.
- Preserve the current avatar trigger and profile panel visual design.
- Preserve profile information, links, and logout behavior.
- Use `close(false)` for navigation where restoring focus before navigation is unnecessary.
- Ensure logout closes the panel before or as logout begins.
- Remove profile-specific Floating UI positioning, native-popover detection, resize/scroll listeners, Escape handling, outside-click handling, and focus restoration.
- Remove obsolete popover types and helpers from `login-button/utils.ts`.
- Keep the login dialog path unchanged.

The exact split between `index.svelte` and `profile-popover.svelte` may change to accommodate the headless snippet contract, but profile-specific presentation should remain separate where that improves readability.

### MIDI popover

File involved:

- `apps/web/src/components/midi-control/index.svelte`

Migration requirements:

- Use the shared primitive with `ariaLabel="MIDI settings"` and the default `dialog` role.
- Preserve the current trigger and panel visual design.
- Remove conditional panel mounting and consumer-owned absolute positioning.
- Remove the relative-positioning dependency from `.midi-control` if no longer needed.
- Keep MIDI toggle, device listing, copied-ID state, and copy-error behavior unchanged.
- Allow the automatic first-focusable fallback to focus the MIDI switch unless an explicit initial target becomes preferable during testing.
- Retain responsive width and max-height/overflow presentation in the consumer class.

## Testing

Add browser component coverage for the shared primitive because native popover, focus, and geometry behavior cannot be validated reliably in a DOM-only test environment.

Cover at least:

1. Generated trigger and panel attributes are connected by `aria-controls` and `id`.
2. Explicit IDs are respected.
3. The required label and default dialog role are applied.
4. The trigger opens and closes the panel.
5. A bound `open` value controls the native panel and tracks native state changes.
6. `use:initialFocus` takes precedence.
7. The first-focusable fallback works.
8. The panel fallback works when there are no focusable descendants.
9. Escape closes and restores trigger focus.
10. Outside click closes without stealing focus from the outside target.
11. `close()` restores focus.
12. `close(false)` does not restore focus.
13. Floating UI applies positioning and flips/shifts near viewport boundaries.
14. `autoUpdate()` responds to relevant layout, resize, or scroll changes while open.

Add targeted integration coverage or manual checks for the migrated profile and MIDI consumers without duplicating every primitive behavior test.

## Acceptance criteria

- Both existing popovers use `core/popover`.
- Both retain their current visual designs and content behavior.
- Both render in the native top layer and use Floating UI positioning.
- Trigger/panel ARIA relationships and labels are correct.
- Keyboard users enter the panel on open and can dismiss it with Escape.
- Focus restoration follows the specified dismissal policy.
- Outside clicks and opening another auto popover use native light dismissal.
- No legacy native-popover fallback or manual resize/scroll/dismissal implementation remains in the profile component.
- MIDI no longer depends on a conditionally rendered absolute-positioned panel.
- Browser component tests cover the shared behavior.
- Formatting, type checks, lint, and relevant tests pass.

## Verification

From the repository root, run the project-equivalent commands for:

```text
pnpm --filter web format
pnpm --filter web check
pnpm --filter web lint
pnpm --filter web test
```

Confirm the exact workspace command syntax from the root `package.json` before execution. Do not run the development server without prior approval.

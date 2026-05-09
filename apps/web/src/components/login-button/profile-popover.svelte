<script lang="ts">
	import { updatePosition, supportsPopover, type PopoverProps } from './utils';

	let {
		ref = $bindable(),
		isOpen = $bindable(false),
		trigger,
		did,
		displayName,
		handle,
		onlogout
	}: PopoverProps = $props();

	function dismiss() {
		if (supportsPopover && ref?.matches(':popover-open')) ref.hidePopover();
		else ref?.classList.remove('is-open');

		isOpen = false;
		trigger?.focus();
	}

	// Show/hide based on isOpen
	$effect(() => {
		if (!ref) return;
		if (isOpen) {
			if (supportsPopover) ref.showPopover();
			else ref.classList.add('is-open');

			updatePosition(ref, trigger);
			requestAnimationFrame(() => ref?.querySelector('a')?.focus());
		} else {
			if (supportsPopover && ref.matches(':popover-open')) {
				(ref as unknown as { hidePopover: () => void }).hidePopover();
			} else {
				ref.classList.remove('is-open');
			}
		}
	});

	// Reposition on resize/scroll while open
	$effect(() => {
		if (!isOpen) return;
		const update = () => updatePosition(ref, trigger);
		window.addEventListener('resize', update, { passive: true });
		window.addEventListener('scroll', update, { passive: true, capture: true });
		return () => {
			window.removeEventListener('resize', update);
			window.removeEventListener('scroll', update, { capture: true });
		};
	});

	// Escape + click-outside (both paths need this since popover="manual" never auto-dismisses)
	$effect(() => {
		if (!isOpen) return;
		const onKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') dismiss();
		};
		const onPointerdown = (e: PointerEvent) => {
			const t = e.target as Node;
			if (!ref?.contains(t) && !trigger?.contains(t)) dismiss();
		};
		document.addEventListener('keydown', onKeydown);
		document.addEventListener('pointerdown', onPointerdown);
		return () => {
			document.removeEventListener('keydown', onKeydown);
			document.removeEventListener('pointerdown', onPointerdown);
		};
	});
</script>

<div
	bind:this={ref}
	id="profile-popover"
	popover={supportsPopover ? 'manual' : undefined}
	role="dialog"
	aria-modal="false"
	aria-label="Profile"
	class="profile-popover"
	data-open={isOpen}
>
	<div class="profile-info">
		{#if displayName}
			<p class="display-name">{displayName}</p>
		{/if}
		<p class="handle">@{handle}</p>
	</div>
	<nav class="links">
		<a href="/repl" class="profile-link" onclick={dismiss}>Repl</a>
		<a href="/feed" class="profile-link" onclick={dismiss}>Feed</a>
		<a href="/bookmarks" class="profile-link" onclick={dismiss}>Bookmarks</a>
		<a href="/profile/{did}" class="profile-link" onclick={dismiss}>Profile</a>
		<button class="logout-btn" onclick={onlogout}>Log out</button>
	</nav>
</div>

<style>
	.profile-popover {
		position: fixed;
		inset: unset;
		top: 0;
		left: 0;
		display: none;
		gap: 1rem;
		min-width: 14rem;
		padding: 1rem 0.5rem 0.75rem;
		margin: 0;
		border: none;
		border-radius: 0.5rem;
		background: light-dark(var(--ui-color-bg-primary), var(--ui-color-bg-secondary));
		outline: 1px solid rgb(255 255 255 / 0.2);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
		font-size: 0.875rem;

		&:is(:popover-open, [data-open='true']) {
			display: grid;
		}
	}

	.profile-info {
		padding-inline: 0.75rem;

		.display-name {
			font-size: 0.9375rem;
			font-weight: 600;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.handle {
			color: var(--ui-color-fg-tertiary);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}

	.links {
		display: grid;

		:is(a, button) {
			display: flex;
			align-items: center;
			block-size: 2rem;
			padding: 0 0.75rem;
			border: none;
			background: none;
			text-decoration: none;
			border-radius: 0.375rem;
			cursor: pointer;

			&:hover {
				color: var(--ui-color-fg-secondary);
			}
		}
	}
</style>

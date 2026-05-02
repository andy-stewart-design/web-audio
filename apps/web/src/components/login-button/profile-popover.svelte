<script lang="ts">
	import { updatePosition, supportsPopover, type PopoverProps } from './utils';

	let {
		ref = $bindable(),
		isOpen = $bindable(false),
		trigger,
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
			requestAnimationFrame(() => ref?.querySelector('button')?.focus());
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
			<span class="display-name">{displayName}</span>
		{/if}
		<span class="handle">@{handle}</span>
	</div>
	<button class="logout-btn" onclick={onlogout}>Log out</button>
</div>

<style>
	.profile-popover {
		position: fixed;
		inset: unset;
		top: 0;
		left: 0;
		display: none;
		flex-direction: column;
		gap: 0.75rem;
		min-width: 14rem;
		padding: 1rem;
		margin: 0;
		border: 1px solid rgba(0, 0, 0, 0.12);
		border-radius: 0.5rem;
		background: #fff;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);

		&:is(:popover-open, [data-open='true']) {
			display: flex;
		}
	}

	.profile-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		overflow: hidden;
	}

	.display-name {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.handle {
		font-size: 0.875rem;
		color: #666;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.logout-btn {
		inline-size: 100%;
		block-size: 2rem;
		background: transparent;
		padding-inline: 0.75rem;
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 0.375rem;
		font-size: 0.875rem;
	}

	.logout-btn:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.logout-btn:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}
</style>

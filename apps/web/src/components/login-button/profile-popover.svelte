<script lang="ts">
	import Popover from '@/components/core/popover/index.svelte';
	import Avatar from './avatar.svelte';
	import type { PopoverProps } from './utils';

	let { session, onlogout }: PopoverProps = $props();
	const avatarLabel = $derived(session.displayName ?? session.handle ?? session.did);
</script>

<Popover id="profile-popover" ariaLabel="Profile">
	{#snippet trigger({ trigger, props })}
		<button
			use:trigger
			{...props}
			class="avatar"
			aria-label={props['aria-expanded'] ? 'Close profile menu' : 'Open profile menu'}
		>
			<Avatar avatar={session.avatar} alt={avatarLabel} />
		</button>
	{/snippet}
	{#snippet content({ popover, props, close, initialFocus })}
		<div use:popover {...props} class="profile-popover">
			<div class="profile-info">
				{#if session.displayName}
					<p class="display-name">{session.displayName}</p>
				{/if}
				<p class="handle">@{session.handle}</p>
			</div>
			<nav class="links">
				<a href="/repl" class="profile-link" use:initialFocus onclick={() => close(false)}>Repl</a>
				<a href="/feed" class="profile-link" onclick={() => close(false)}>Feed</a>
				<a href="/bookmarks" class="profile-link" onclick={() => close(false)}>Bookmarks</a>
				<a href="/profile/{session.did}" class="profile-link" onclick={() => close(false)}
					>Profile</a
				>
				<button
					class="logout-btn"
					onclick={async () => {
						close();
						await onlogout();
					}}>Log out</button
				>
			</nav>
		</div>
	{/snippet}
</Popover>

<style>
	.avatar {
		display: flex;
		justify-content: center;
		align-items: center;
		block-size: 2.25rem;
		inline-size: 2.25rem;
		padding: 0;
		border: none;
		border-radius: 100vmax;
		background: var(--color-bg-secondary);

		&:focus-visible {
			outline: 2px solid currentColor;
			outline-offset: 2px;
		}
	}

	.profile-popover {
		--popover-display: grid;

		gap: 1rem;
		min-width: 14rem;
		padding: 1rem 0.5rem 0.75rem;
		border: none;
		border-radius: 0.5rem;
		background: light-dark(var(--color-bg-primary), var(--color-bg-secondary));
		outline: 1px solid rgb(255 255 255 / 0.2);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
		font-size: 0.875rem;
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
			color: var(--color-fg-tertiary);
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
				color: var(--color-fg-secondary);
			}
		}
	}
</style>

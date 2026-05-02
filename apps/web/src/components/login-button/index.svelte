<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import IconUser24 from '@/components/icons/icon-user-24.svelte';
	import LoginDialog from './login-dialog.svelte';
	import ProfilePopover from './profile-popover.svelte';
	import { getOAuthURL, type ButtonProps } from './utils';

	let { did, handle, displayName, avatar }: ButtonProps = $props();

	// ── login dialog ──────────────────────────────────────────────────────────
	let inputHandle = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let dialogEl = $state<HTMLDialogElement | undefined>();

	// ── profile popover ───────────────────────────────────────────────────────
	let isOpen = $state(false);
	let triggerEl = $state<HTMLButtonElement | undefined>();

	async function handleLogout() {
		isOpen = false;
		await fetch('/oauth/logout', { method: 'POST' });
		await invalidateAll();
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		loading = true;
		error = null;
		try {
			const redirectUrl = await getOAuthURL(inputHandle);
			window.location.href = redirectUrl;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Login failed';
			loading = false;
		}
	}

	const openDialog = () => dialogEl?.showModal();
</script>

<button
	bind:this={triggerEl}
	class="avatar"
	onclick={did ? () => (isOpen = !isOpen) : openDialog}
	aria-label={did ? (isOpen ? 'Close profile menu' : 'Open profile menu') : 'Login'}
	aria-haspopup={did ? 'dialog' : undefined}
	aria-expanded={did ? isOpen : undefined}
	aria-controls={did ? 'profile-popover' : undefined}
>
	{#if avatar}
		<img src={avatar} alt={displayName ?? handle ?? did} class="avatar" />
	{:else}
		<IconUser24 />
	{/if}
</button>

{#if did}
	<ProfilePopover bind:isOpen trigger={triggerEl} {displayName} {handle} onlogout={handleLogout} />
{:else}
	<LoginDialog
		bind:ref={dialogEl}
		bind:handle={inputHandle}
		onsubmit={handleSubmit}
		{loading}
		{error}
	/>
{/if}

<style>
	.avatar {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 2.5rem;
		height: 2.5rem;
		background: #efefef;
		padding: 0;
		border: none;
		border-radius: 100vmax;

		img {
			display: block;
			width: 100%;
			height: 100%;
			object-fit: cover;
		}

		:global(svg) {
			opacity: 0.666;
		}
	}

	.avatar:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}
</style>

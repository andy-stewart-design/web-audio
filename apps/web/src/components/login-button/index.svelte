<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Avatar from './avatar.svelte';
	import LoginDialog from './login-dialog.svelte';
	import ProfilePopover from './profile-popover.svelte';
	import { getOAuthURL, type ButtonProps } from './utils';

	let { session }: ButtonProps = $props();

	let inputHandle = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let dialogEl = $state<HTMLDialogElement | undefined>();

	async function handleLogout() {
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

{#if session.did}
	<ProfilePopover {session} onlogout={handleLogout} />
{:else}
	<button class="avatar" onclick={openDialog} aria-label="Login">
		<Avatar avatar={session.avatar} alt={session.displayName ?? session.handle ?? 'User'} />
	</button>
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
		block-size: 2.25rem;
		inline-size: 2.25rem;
		background: var(--color-bg-secondary);
		padding: 0;
		border: none;
		border-radius: 100vmax;

		&:focus-visible {
			outline: 2px solid currentColor;
			outline-offset: 2px;
		}
	}
</style>

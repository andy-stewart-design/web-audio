<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import IconUser24 from '@/components/icons/icon-user-24.svelte';
	import { getOAuthURL, type Props } from './utils';

	let { did, handle, displayName, avatar }: Props = $props();

	let inputHandle = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let dialog = $state<HTMLDialogElement>();

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

	async function handleLogout() {
		await fetch('/oauth/logout', { method: 'POST' });
		await invalidateAll();
	}

	const openDialog = () => dialog?.showModal();
</script>

<button
	class="avatar"
	onclick={did ? handleLogout : openDialog}
	aria-label={did ? 'Logout' : 'Login'}
>
	{#if avatar}
		<img src={avatar} alt={displayName ?? handle ?? did} class="avatar" />
	{:else}
		<IconUser24 />
	{/if}
</button>

{#if !did}
	<dialog bind:this={dialog}>
		<h2>Login</h2>
		<form onsubmit={handleSubmit}>
			<label>
				Handle
				<input
					id="handle"
					type="text"
					bind:value={inputHandle}
					placeholder="user.bsky.social"
					disabled={loading}
				/>
			</label>
			<div class="button-container">
				<button type="submit" disabled={loading}>Login</button>
			</div>
			{#if error}
				<p class="error">{error}</p>
			{/if}
		</form>
	</dialog>
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

	dialog {
		gap: 1rem;
		inline-size: 100%;
		max-inline-size: 480px;

		&[open] {
			display: grid;
		}
	}

	form {
		display: grid;
		gap: 1rem;
	}

	label {
		display: grid;
		gap: 0.5rem;
	}

	.button-container {
		display: flex;
		justify-content: flex-end;
	}
</style>

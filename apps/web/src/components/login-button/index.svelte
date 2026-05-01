<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let {
		did,
		handle,
		displayName,
		avatar
	}: {
		did: string | null;
		handle: string | null;
		displayName: string | null;
		avatar: string | null;
	} = $props();

	let inputHandle = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let dialog = $state<HTMLDialogElement>();

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		loading = true;
		error = null;

		try {
			const res = await fetch('/oauth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ handle: inputHandle })
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Login failed');
			}

			window.location.href = data.redirectUrl;
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

{#if did}
	<div class="session">
		{#if avatar}
			<img src={avatar} alt={displayName ?? handle ?? did} class="avatar" />
		{/if}
		<span class="name">{displayName ?? handle ?? did}</span>
		<button onclick={handleLogout}>Logout</button>
	</div>
{:else}
	<button onclick={openDialog}>Login</button>

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
	.session {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.avatar {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		object-fit: cover;
	}

	.name {
		font-size: 0.875rem;
		color: #6b7280;
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

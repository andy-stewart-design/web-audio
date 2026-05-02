<script lang="ts">
	let {
		ref = $bindable(),
		handle = $bindable(),
		loading,
		error
	}: {
		ref: HTMLDialogElement | undefined;
		handle: string;
		onsubmit: (e: SubmitEvent) => Promise<void>;
		loading: boolean;
		error: string | null;
	} = $props();
</script>

<dialog bind:this={ref}>
	<h2>Login</h2>
	<form {onsubmit}>
		<label>
			Handle
			<input
				id="handle"
				type="text"
				bind:value={handle}
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

<style>
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

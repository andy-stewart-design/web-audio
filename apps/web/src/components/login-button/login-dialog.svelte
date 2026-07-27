<script lang="ts">
	import Dialog from '@/components/core/dialog/index.svelte';
	import type { DialogProps } from './utils';

	let { handle = $bindable(), loading, onsubmit, error }: DialogProps = $props();
	let dialog: Dialog;

	export function open() {
		dialog.open();
	}

	export function close() {
		dialog.close();
	}
</script>

<Dialog bind:this={dialog} title="Login">
	{#snippet content()}
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
	{/snippet}
</Dialog>

<style>
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

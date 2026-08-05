<script lang="ts">
	import Dialog from '@/components/core/dialog/index.svelte';
	import Button from '@/components/core/button/index.svelte';
	import TextInput from '@/components/core/text-input/index.svelte';
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
			<TextInput
				label="Handle"
				id="handle"
				bind:value={handle}
				placeholder="user.bsky.social"
				disabled={loading}
				autocapitalize="none"
				inputmode="url"
				autofocus
				data-role="surface-tertiary"
			/>
			<div class="button-container">
				<Button type="submit" disabled={loading}>Login</Button>
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

	.button-container {
		display: flex;
		justify-content: flex-end;
	}
</style>

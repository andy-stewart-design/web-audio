<script lang="ts">
	import { enhance } from '$app/forms';
	import Dialog from '@/components/core/dialog/index.svelte';
	import type { DraftSketch } from '$lib/types/sketch';

	let { draft, error }: { draft: DraftSketch | null; error?: string } = $props();

	let dialog: Dialog;
	let isSubmitting = $state(false);
	let publishedUri = $state<string | null>(null);

	export function open() {
		publishedUri = null;
		dialog.open();
	}

	export function close() {
		dialog.close();
	}
</script>

<Dialog bind:this={dialog} title={publishedUri ? 'Published!' : 'Publish sketch'}>
	{#snippet content()}
		{#if publishedUri}
			<p>Your sketch is live on the network.</p>
			<code class="uri">{publishedUri}</code>
			<div class="dialog-actions">
				<button onclick={close}>close</button>
			</div>
		{:else if draft}
			<form
				method="POST"
				action="?/publish"
				use:enhance={({ formData }) => {
					formData.set('code', draft.code);
					if (draft.previousVersion) formData.set('previousVersion', draft.previousVersion);
					if (draft.rootVersion) formData.set('rootVersion', draft.rootVersion);
					isSubmitting = true;
					return async ({ result, update }) => {
						isSubmitting = false;
						if (result.type === 'success' && result.data?.uri) {
							const newUri = result.data.uri as string;
							draft.rootVersion = draft.rootVersion ?? newUri;
							draft.previousVersion = newUri;
							publishedUri = newUri;
						} else {
							await update();
						}
					};
				}}
			>
				<label>
					<div class="label-row">Title <span class="hint-small">Required</span></div>
					<input name="title" bind:value={draft.title} required autocomplete="off" />
				</label>
				<label>
					Description
					<textarea name="description" bind:value={draft.description} rows={3}></textarea>
				</label>
				<label>
					<div class="label-row">Tags <span class="hint-small">Comma-separated</span></div>
					<input name="tags" bind:value={draft.tags} placeholder="ambient, generative, …" />
				</label>

				{#if error}
					<p class="form-error">{error}</p>
				{/if}

				<div class="dialog-actions">
					<button type="button" onclick={close}>cancel</button>
					<button type="submit" disabled={isSubmitting}>
						{isSubmitting ? 'publishing…' : 'publish'}
					</button>
				</div>
			</form>
		{/if}
	{/snippet}
</Dialog>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.875rem;
	}

	.label-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	input,
	textarea {
		padding: 0.375rem 0.5rem;
		background: var(--color-bg-primary);
		color: var(--color-fg-primary);
		border: 1px solid var(--color-border-subtle);
		border-radius: 4px;
		font-family: monospace;
		font-size: 0.875rem;
		resize: vertical;
	}

	.hint-small {
		font-size: 0.75rem;
		color: var(--color-fg-tertiary);
	}

	.form-error {
		font-size: 0.875rem;
		color: #f38ba8;
	}

	.uri {
		display: block;
		margin: 0.75rem 0;
		padding: 0.5rem;
		background: #313244;
		border-radius: 4px;
		font-size: 0.8rem;
		word-break: break-all;
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import Dialog from '@/components/core/dialog/index.svelte';
	import Button from '@/components/core/button/index.svelte';
	import TextInput from '@/components/core/text-input/index.svelte';
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
			<code class="uri" data-role="surface-tertiary">{publishedUri}</code>
			<div class="dialog-actions">
				<button onclick={close}>close</button>
			</div>
		{:else if draft}
			<form
				method="POST"
				action="?/publish"
				data-role="surface-tertiary"
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
				<TextInput
					label="Title"
					name="title"
					hint="Required"
					bind:value={draft.title}
					required
					autocomplete="off"
					autocapitalize="sentences"
				/>
				<TextInput
					multiline
					label="Description"
					name="description"
					bind:value={draft.description}
					autocapitalize="sentences"
				/>
				<TextInput
					label="Tags"
					hint="Comma-separated"
					name="tags"
					bind:value={draft.tags}
					placeholder="ambient, generative, …"
					autocomplete="off"
					autocapitalize="none"
				/>

				{#if error}
					<p class="form-error" data-role="alert">{error}</p>
				{/if}

				<div class="dialog-actions">
					<Button type="button" onclick={close} variant="tertiary">Cancel</Button>
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? 'Publishing…' : 'Publish'}
					</Button>
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

	.form-error {
		font-size: 0.875rem;
		color: var(--color-foreground-secondary);
	}

	.uri {
		display: block;
		margin: 0.75rem 0;
		padding: 0.5rem;
		background: var(--color-background-primary);
		border: 1px solid var(--color-border-subtle);
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

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import CodeEditor from '@/components/code-editor/index.svelte';
	import type { PageData, ActionData } from './$types';
	import { audioPlayer, sketchPersistence, sketchWorkspace } from '$lib/globals';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Read initial sketch data once — untrack prevents Svelte from warning about
	// one-time reads of reactive `data` while initializing global draft state.
	const initialSketch = untrack(() => data.loadedSketch);
	sketchWorkspace.openDraft(initialSketch ?? undefined);

	const draft = $derived(sketchWorkspace.draft);

	let publish = $state({
		dialogEl: undefined as HTMLDialogElement | undefined,
		isSubmitting: false,
		publishedUri: null as string | null
	});

	async function runDraft() {
		const loaded = sketchWorkspace.commitDraft();

		if (loaded) {
			const entry = await audioPlayer.play(loaded.code);
			sketchWorkspace.addLog(entry);
		}
	}

	function canPublish() {
		return Boolean(data.session.did && sketchWorkspace.draft?.code.trim());
	}

	function openPublishDialog() {
		publish.publishedUri = null;
		publish.dialogEl?.showModal();
	}

	onMount(() => {
		const shouldStop = !initialSketch || sketchWorkspace.loaded?.uri !== initialSketch.uri;
		if (shouldStop) audioPlayer.stop();

		return sketchPersistence.register({
			canPublish,
			publish: openPublishDialog
		});
	});
</script>

<div class="repl">
	<div class="body">
		<div class="col-left">
			<div class="editor">
				{#if draft}
					<CodeEditor bind:value={draft.code} onRun={runDraft} onStop={() => audioPlayer.stop()} />
				{/if}
			</div>
		</div>

		<aside class="sidebar" aria-label="REPL sidebar">
			<section class="panel" aria-label="Output log">
				<h2>Log</h2>
				<div class="log">
					{#if sketchWorkspace.logs.length === 0}
						<span class="empty">no output</span>
					{:else}
						{#each sketchWorkspace.logs as entry (entry.id)}
							<div class={entry.type}>{entry.type === 'output' ? '✓' : '×'} {entry.message}</div>
						{/each}
					{/if}
				</div>
			</section>
		</aside>
	</div>
</div>

<dialog bind:this={publish.dialogEl} class="publish-dialog">
	{#if publish.publishedUri}
		<h2>Published!</h2>
		<p>Your sketch is live on the network.</p>
		<code class="uri">{publish.publishedUri}</code>
		<div class="dialog-actions">
			<button onclick={() => publish.dialogEl?.close()}>close</button>
		</div>
	{:else if draft}
		<h2>Publish sketch</h2>
		<form
			method="POST"
			action="?/publish"
			use:enhance={({ formData }) => {
				formData.set('code', draft.code);
				if (draft.previousVersion) formData.set('previousVersion', draft.previousVersion);
				if (draft.rootVersion) formData.set('rootVersion', draft.rootVersion);
				publish.isSubmitting = true;
				return async ({ result, update }) => {
					publish.isSubmitting = false;
					if (result.type === 'success' && result.data?.uri) {
						const newUri = result.data.uri as string;
						draft.rootVersion = draft.rootVersion ?? newUri;
						draft.previousVersion = newUri;
						publish.publishedUri = newUri;
					} else {
						await update();
					}
				};
			}}
		>
			<label>
				<div class="label-row">
					Title <span class="hint-small">Required</span>
				</div>
				<input name="title" bind:value={draft.title} required autocomplete="off" />
			</label>
			<label>
				Description
				<textarea name="description" bind:value={draft.description} rows={3}></textarea>
			</label>
			<label>
				<div class="label-row">
					Tags <span class="hint-small">Comma-separated</span>
				</div>
				<input name="tags" bind:value={draft.tags} placeholder="ambient, generative, …" />
			</label>

			{#if form?.error}
				<p class="form-error">{form.error}</p>
			{/if}

			<div class="dialog-actions">
				<button type="button" onclick={() => publish.dialogEl?.close()}>cancel</button>
				<button type="submit" disabled={publish.isSubmitting}>
					{publish.isSubmitting ? 'publishing…' : 'publish'}
				</button>
			</div>
		</form>
	{/if}
</dialog>

<style>
	.repl {
		display: grid;
		height: 100%;
		min-height: 0;
		overflow: clip;
	}

	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) clamp(280px, 24vw, 360px);
		min-height: 0;
		overflow: clip;
	}

	.col-left {
		display: grid;
		height: 100%;
		overflow: hidden;
	}

	.editor {
		min-width: 0;
		min-height: 0;
		overflow: clip;
		block-size: calc(100dvh - var(--ui-header-block-size));
		background: var(--color-bg-primary);
		height: 100%;
	}

	.sidebar {
		min-height: 0;
		overflow: hidden;

		border-left: 1px solid var(--color-border-subtle);
	}

	.panel {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		height: 100%;
		min-height: 0;

		h2 {
			padding: 0.75rem 1rem;
			font-size: 0.875rem;
			font-weight: 600;
			border-bottom: 1px solid var(--color-border-subtle);
		}
	}

	.log {
		min-height: 0;
		padding: 0.75rem 1rem;
		overflow-y: auto;
		font-family: monospace;
		font-size: var(--font-xs);
		background: var(--color-bg-secondary);
	}

	.empty {
		color: var(--color-fg-tertiary);
	}

	.output {
		color: #a6e3a1;
	}

	.error {
		color: #f38ba8;
	}

	/* Publish dialog */
	.publish-dialog {
		width: min(480px, 90vw);
		padding: 1.5rem;
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border-subtle);
		border-radius: 8px;
		color: var(--color-fg-primary);

		&::backdrop {
			background: rgb(0 0 0 / 0.5);
			backdrop-filter: blur(2px);
		}

		h2 {
			margin-bottom: 1rem;
		}

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

			.label-row {
				display: flex;
				justify-content: space-between;
				align-items: baseline;
			}
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

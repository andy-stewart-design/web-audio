<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import CodeEditor from '@/components/code-editor/index.svelte';
	import type { PageData, ActionData } from './$types';
	import { audio } from '$lib/client/audio.svelte';
	import { globalControls } from '$lib/client/global-controls.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const DEFAULT_CODE = `d.synth("triangle").push()`;

	type LogEntry = { id: string; text: string; type: 'output' | 'error' };

	// Read initial sketch data once — untrack prevents Svelte from warning about
	// one-time reads of reactive `data` inside $state() initializers.
	const initialSketch = untrack(() => data.loadedSketch);

	// REPL state — seeded from ?load= param if present
	let code = $state(initialSketch?.code ?? DEFAULT_CODE);
	let logs = $state<LogEntry[]>([]);

	let publish = $state({
		dialogEl: undefined as HTMLDialogElement | undefined,
		title: initialSketch?.title ?? '',
		description: initialSketch?.description ?? '',
		tags: initialSketch?.tags?.join(', ') ?? '',
		isSubmitting: false,
		publishedUri: null as string | null
	});

	// Version chain — seeded from loaded sketch if it's a fork/republish
	let version = $state({
		rootUri: initialSketch?.rootVersion ?? initialSketch?.uri ?? null,
		previousUri: initialSketch?.uri ?? null
	});

	function addLog(text: string, type: LogEntry['type']) {
		logs = [{ id: crypto.randomUUID(), text, type }, ...logs];
	}

	async function runCode(input: string = code) {
		try {
			await audio.play({
				uri: initialSketch?.uri ?? null,
				title: publish.title.trim() || initialSketch?.title || '',
				code: input
			});
			addLog('✓ Code evaluated', 'output');
		} catch (err) {
			addLog(`× ${(err as Error).message}`, 'error');
		}
	}

	function stop() {
		audio.stop();
	}

	function canPublish() {
		return Boolean(data.session.did && code.trim());
	}

	function openPublishDialog() {
		publish.publishedUri = null;
		publish.dialogEl?.showModal();
	}

	onMount(() => {
		if (!initialSketch) {
			audio.clear();
		} else if (audio.loadedSketch?.uri !== initialSketch.uri) {
			audio.stop();
			audio.load({
				uri: initialSketch.uri,
				title: initialSketch.title,
				code: initialSketch.code
			});
		}

		return globalControls.register({
			play: () => runCode(),
			canPlay: () => Boolean(code.trim()),
			canPublish,
			publish: openPublishDialog
		});
	});
</script>

<div class="repl">
	<div class="body">
		<div class="col-left">
			<div class="editor">
				<CodeEditor bind:value={code} onRun={runCode} onStop={stop} />
			</div>
		</div>

		<aside class="sidebar" aria-label="REPL sidebar">
			<section class="panel" aria-label="Output log">
				<h2>Log</h2>
				<div class="log">
					{#if logs.length === 0}
						<span class="empty">no output</span>
					{:else}
						{#each logs as entry (entry.id)}
							<div class={entry.type}>{entry.text}</div>
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
	{:else}
		<h2>Publish sketch</h2>
		<form
			method="POST"
			action="?/publish"
			use:enhance={({ formData }) => {
				formData.set('code', code);
				if (version.previousUri) formData.set('previousVersion', version.previousUri);
				if (version.rootUri) formData.set('rootVersion', version.rootUri);
				publish.isSubmitting = true;
				return async ({ result, update }) => {
					publish.isSubmitting = false;
					if (result.type === 'success' && result.data?.uri) {
						const newUri = result.data.uri as string;
						version.rootUri = version.rootUri ?? newUri;
						version.previousUri = newUri;
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
				<input name="title" bind:value={publish.title} required autocomplete="off" />
			</label>
			<label>
				Description
				<textarea name="description" bind:value={publish.description} rows={3}></textarea>
			</label>
			<label>
				<div class="label-row">
					Tags <span class="hint-small">Comma-separated</span>
				</div>
				<input name="tags" bind:value={publish.tags} placeholder="ambient, generative, …" />
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

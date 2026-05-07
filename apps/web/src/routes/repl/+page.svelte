<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import AudioClock from '@web-audio/clock';
	import { createAudioContext, type ManagedAudioContext } from '@web-audio/context';
	import Drome from '@web-audio/fluid';
	import AudioEngine from '@web-audio/audio-engine';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const DEFAULT_CODE = `d.synth("triangle").push()`;

	type LogEntry = { id: string; text: string; type: 'output' | 'error' };

	// Read initial sketch data once — untrack prevents Svelte from warning about
	// one-time reads of reactive `data` inside $state() initializers.
	const initial = untrack(() => data.loadedSketch);

	// REPL state — seeded from ?load= param if present
	let code = $state(initial?.code ?? DEFAULT_CODE);
	let isRunning = $state(false);
	let logs = $state<LogEntry[]>([]);

	// Publish dialog state
	let dialogEl = $state<HTMLDialogElement | undefined>();
	let publishTitle = $state(initial?.title ?? '');
	let publishDescription = $state(initial?.description ?? '');
	let publishTags = $state(initial?.tags?.join(', ') ?? '');
	let publishing = $state(false);
	let publishedUri = $state<string | null>(null);

	// Version chain — seeded from loaded sketch if it's a fork/republish
	let rootVersionUri = $state<string | null>(initial?.rootVersion ?? initial?.uri ?? null);
	let previousVersionUri = $state<string | null>(initial?.uri ?? null);

	// Audio refs — not reactive, initialized lazily
	let audioCtx: ManagedAudioContext | null = null;
	let clock: AudioClock | null = null;
	let engine: AudioEngine | null = null;

	function getAudio() {
		if (!audioCtx || audioCtx.ctx.state === 'closed') {
			audioCtx = createAudioContext({ allowBackgroundPlayback: true });
		}
		return audioCtx;
	}

	function getClock() {
		if (!clock) clock = new AudioClock(getAudio().ctx, 140, 4);
		return clock;
	}

	function getEngine() {
		if (!engine) engine = new AudioEngine(getAudio().ctx, getClock());
		return engine;
	}

	function addLog(text: string, type: LogEntry['type']) {
		logs = [{ id: crypto.randomUUID(), text, type }, ...logs];
	}

	async function evaluate(input: string) {
		try {
			const d = new Drome();
			new Function('drome', 'd', input)(d, d);
			const schema = d.getSchema();
			getEngine().update(schema);
			if (!isRunning) {
				await getClock().start();
				isRunning = true;
			}
			addLog('✓', 'output');
		} catch (error) {
			addLog(`✗ ${(error as Error).message}`, 'error');
		}
	}

	function stop() {
		if (!isRunning) return;
		clock?.stop();
		isRunning = false;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			evaluate(code);
		}
	}

	function openPublishDialog() {
		publishedUri = null;
		dialogEl?.showModal();
	}

	onDestroy(() => {
		engine?.destroy();
		clock?.stop();
		audioCtx?.dispose();
		engine = null;
		clock = null;
		audioCtx = null;
	});
</script>

<div class="repl">
	<div class="toolbar">
		<button onclick={() => evaluate(code)}>Run</button>
		<button onclick={stop} disabled={!isRunning}>Stop</button>
		<span class="hint">⌘↵</span>
		<button
			class="publish-btn"
			onclick={openPublishDialog}
			disabled={!data.session.did || !code.trim()}
			title={!data.session.did ? 'Log in to publish' : 'Publish sketch'}
		>
			Publish
		</button>
	</div>

	<textarea bind:value={code} onkeydown={handleKeyDown} spellcheck={false} class="editor"
	></textarea>

	<div class="log">
		{#if logs.length === 0}
			<span class="empty">no output</span>
		{:else}
			{#each logs as entry (entry.id)}
				<div class={entry.type}>{entry.text}</div>
			{/each}
		{/if}
	</div>
</div>

<dialog bind:this={dialogEl} class="publish-dialog">
	{#if publishedUri}
		<h2>Published!</h2>
		<p>Your sketch is live on the network.</p>
		<code class="uri">{publishedUri}</code>
		<div class="dialog-actions">
			<button onclick={() => dialogEl?.close()}>close</button>
		</div>
	{:else}
		<h2>Publish sketch</h2>
		<form
			method="POST"
			action="?/publish"
			use:enhance={({ formData }) => {
				formData.set('code', code);
				if (previousVersionUri) formData.set('previousVersion', previousVersionUri);
				if (rootVersionUri) formData.set('rootVersion', rootVersionUri);
				publishing = true;
				return async ({ result, update }) => {
					publishing = false;
					if (result.type === 'success' && result.data?.uri) {
						const newUri = result.data.uri as string;
						rootVersionUri = rootVersionUri ?? newUri;
						previousVersionUri = newUri;
						publishedUri = newUri;
					} else {
						await update();
					}
				};
			}}
		>
			<label>
				<div class="label-row">
					Title <span class="required">Required</span>
				</div>
				<input name="title" bind:value={publishTitle} required autocomplete="off" />
			</label>
			<label>
				Description
				<textarea name="description" bind:value={publishDescription} rows={3}></textarea>
			</label>
			<label>
				<div class="label-row">
					Tags <span class="hint-small">Comma-separated</span>
				</div>
				<input name="tags" bind:value={publishTags} placeholder="ambient, generative, …" />
			</label>

			{#if form?.error}
				<p class="form-error">{form.error}</p>
			{/if}

			<div class="dialog-actions">
				<button type="button" onclick={() => dialogEl?.close()}>cancel</button>
				<button type="submit" disabled={publishing}>
					{publishing ? 'publishing…' : 'publish'}
				</button>
			</div>
		</form>
	{/if}
</dialog>

<style>
	.repl {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 720px;
		margin: auto;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;

		button {
			padding: 0.375rem 1rem;
			font-size: 0.875rem;
			font-weight: 500;
			border-radius: 100vmax;
			border: none;
			background: var(--ui-color-fg-primary);
			color: var(--ui-color-bg-primary);
			cursor: pointer;
		}
	}

	.hint {
		font-size: 0.875rem;
		color: var(--ui-color-fg-tertiary);
		margin-right: auto;
	}

	.editor {
		width: 100%;
		height: 180px;
		padding: 0.625rem;
		font-family: monospace;
		font-size: 0.9375rem;
		background: var(--ui-color-bg-secondary);
		color: var(--ui-color-fg-primary);
		border: 1px solid var(--ui-color-border-subtle);
		border-radius: 4px;
		resize: vertical;
	}

	.log {
		padding: 0.625rem;
		background: var(--ui-color-bg-secondary);
		border: 1px solid var(--ui-color-border-subtle);
		border-radius: 4px;
		font-family: monospace;
		font-size: 0.9375rem;
		min-height: 80px;
		max-height: 200px;
		overflow-y: auto;
	}

	.empty {
		color: var(--ui-color-fg-tertiary);
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
		background: var(--ui-color-bg-secondary);
		border: 1px solid var(--ui-color-border-subtle);
		border-radius: 8px;
		color: #cdd6f4;

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
			background: var(--ui-color-bg-primary);
			color: var(--ui-color-fg-primary);
			border: 1px solid var(--ui-color-border-subtle);
			border-radius: 4px;
			font-family: monospace;
			font-size: 0.875rem;
			resize: vertical;
		}
	}

	.required {
		color: #f38ba8;
		font-size: 0.75rem;
	}

	.hint-small {
		font-size: 0.75rem;
		color: var(--ui-color-fg-tertiary);
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

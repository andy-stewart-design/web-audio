<script lang="ts">
	import { onDestroy } from 'svelte';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import AudioClock from '@web-audio/clock';
	import { createAudioContext, type ManagedAudioContext } from '@web-audio/context';
	import Drome from '@web-audio/fluid';
	import AudioEngine from '@web-audio/audio-engine';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const DEFAULT_CODE = `d.synth("triangle")
 .root("c4")
 .scale("maj")
 .notes([[0, 2], 4, 6], [6, 4, 2, 0])
 .euclid(3, 8)
 .detune([0, 100])
 .push()`;

	type LogEntry = { id: string; text: string; type: 'output' | 'error' };

	// REPL state
	let code = $state(DEFAULT_CODE);
	let isRunning = $state(false);
	let logs = $state<LogEntry[]>([]);

	// Publish dialog state
	let dialogEl = $state<HTMLDialogElement | undefined>();
	let publishTitle = $state('');
	let publishDescription = $state('');
	let publishTags = $state('');
	let publishing = $state(false);
	let publishedUri = $state<string | null>(null);

	// Version chain — persists across publishes within this session
	let rootVersionUri = $state<string | null>(null); // first-ever URI for this sketch
	let previousVersionUri = $state<string | null>(null); // most recent URI

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
		<button onclick={() => evaluate(code)}>run</button>
		<button onclick={stop} disabled={!isRunning}>stop</button>
		<span class="hint">⌘↵</span>
		<button
			class="publish-btn"
			onclick={openPublishDialog}
			disabled={!data.session.did || !code.trim()}
			title={!data.session.did ? 'Log in to publish' : 'Publish sketch'}
		>
			publish
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
				Title <span class="required">*</span>
				<input name="title" bind:value={publishTitle} required autocomplete="off" />
			</label>
			<label>
				Description
				<textarea name="description" bind:value={publishDescription} rows={3}></textarea>
			</label>
			<label>
				Tags <span class="hint-small">comma-separated</span>
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
		gap: 0.5rem;
		max-width: 640px;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.hint {
		font-size: 0.75rem;
		color: #888;
		margin-right: auto;
	}

	.editor {
		width: 100%;
		height: 180px;
		padding: 0.625rem;
		font-family: monospace;
		font-size: 0.9rem;
		background: #1e1e2e;
		color: #cdd6f4;
		border: 1px solid #45475a;
		border-radius: 4px;
		resize: vertical;
	}

	.log {
		padding: 0.625rem;
		background: #1e1e2e;
		border: 1px solid #45475a;
		border-radius: 4px;
		font-family: monospace;
		font-size: 0.8rem;
		min-height: 80px;
		max-height: 200px;
		overflow-y: auto;
	}

	.empty {
		color: #585b70;
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
		border: 1px solid #45475a;
		border-radius: 8px;
		background: #1e1e2e;
		color: #cdd6f4;

		&::backdrop {
			background: hsl(0 0% 0% / 0.5);
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
		}

		input,
		textarea {
			padding: 0.375rem 0.5rem;
			background: #313244;
			color: #cdd6f4;
			border: 1px solid #45475a;
			border-radius: 4px;
			font-family: monospace;
			font-size: 0.875rem;
			resize: vertical;
		}
	}

	.required {
		color: #f38ba8;
	}

	.hint-small {
		font-size: 0.75rem;
		color: #888;
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

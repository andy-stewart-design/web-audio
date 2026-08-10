<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import AudioVisualizer from '@/components/audio-visualizer/index.svelte';
	import CodeEditor from '@/components/code-editor/index.svelte';
	import PublishDialog from '@/components/publish-dialog/index.svelte';
	import type { PageData, ActionData } from './$types';
	import { audio, persistence, workspace } from '$lib/globals';
	import IconCheck from '@/components/icons/icon-check.svelte';
	import IconClose from '@/components/icons/icon-close.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Read initial sketch data once — untrack prevents Svelte from warning about
	// one-time reads of reactive `data` while initializing global draft state.
	const initialSketch = untrack(() => data.loadedSketch);
	const previousLoadedUri = workspace.loaded?.uri;
	workspace.openDraft(initialSketch ?? undefined);

	const draft = $derived(workspace.draft);

	let publishDialog: PublishDialog;

	async function runDraft() {
		const loaded = workspace.commitDraft();

		if (loaded) {
			const entry = await audio.play(loaded.code);
			workspace.addLog(entry);
		}
	}

	function canPublish() {
		return Boolean(data.session.did && draft?.code.trim());
	}

	function openPublishDialog() {
		publishDialog.open();
	}

	onMount(() => {
		const shouldStop = !initialSketch || previousLoadedUri !== initialSketch.uri;
		if (shouldStop) audio.stop();

		const unregisterPublish = persistence.register({
			canPublish,
			publish: openPublishDialog
		});

		return () => {
			unregisterPublish();
			workspace.clearDraft();
		};
	});
</script>

<div class="repl">
	<div class="body">
		<div class="col-left">
			<div class="editor">
				{#if draft}
					<CodeEditor bind:value={draft.code} onRun={runDraft} onStop={() => audio.stop()} />
				{/if}
			</div>
		</div>

		<aside class="sidebar" aria-label="REPL sidebar">
			<AudioVisualizer />

			<section class="panel" aria-label="Output log">
				<h2>Log</h2>
				<div class="log" data-role="surface-secondary">
					{#if workspace.logs.length === 0}
						<span class="empty">no output</span>
					{:else}
						{#each workspace.logs as entry (entry.id)}
							<div class="msg" data-role={entry.type === 'output' ? 'success' : 'alert'}>
								{#if entry.type === 'error'}
									<IconClose size={12} weight="thin" />
								{:else}
									<IconCheck size={12} weight="thin" />
								{/if}
								{entry.message}
							</div>
						{/each}
					{/if}
				</div>
			</section>
		</aside>
	</div>
</div>

<PublishDialog bind:this={publishDialog} {draft} error={form?.error} />

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
		background: var(--color-background-primary);
		height: 100%;
	}

	.sidebar {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
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
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-auto-rows: max-content;
		gap: var(--space-1);
		min-height: 0;
		padding: 0.75rem 1rem;
		overflow-y: auto;
		font: var(--font-code-small);
		background: var(--color-background-primary);
	}

	.empty {
		color: var(--color-foreground-tertiary);
	}

	.msg {
		display: flex;
		color: var(--color-foreground-secondary);
		gap: var(--space-2);

		& > :global(svg) {
			flex-shrink: 0;
			margin-top: 3px;
		}
	}
</style>

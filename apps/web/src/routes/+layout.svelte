<script lang="ts">
	import { page } from '$app/state';
	import LoginButton from '@/components/login-button/index.svelte';
	import IconPlay from '@/components/icons/icon-play.svelte';
	import IconPublish from '@/components/icons/icon-publish.svelte';
	import IconRepeat from '@/components/icons/icon-repeat.svelte';
	import IconStop from '@/components/icons/icon-stop.svelte';
	import favicon from '@/lib/assets/favicon.svg';
	import { audioPlayer, sketchPersistence, sketchWorkspace } from '@/lib/globals';
	import '@/styles/global.css';

	let { children, data } = $props();

	const isRepl = $derived(page.url.pathname === '/repl');
	const isRunning = $derived(audioPlayer.isRunning);
	const canPlay = $derived(Boolean(sketchWorkspace.draft?.code.trim() || sketchWorkspace.loaded));
	const playLabel = $derived(
		isRepl ? (isRunning ? 'Restart sketch' : 'Run sketch') : 'Play sketch'
	);
	const showRepeatIcon = $derived(isRepl && isRunning);

	async function handlePlay() {
		if (isRepl && sketchWorkspace.draft) {
			const loaded = sketchWorkspace.commitDraft();
			if (!loaded) return;

			const log = await audioPlayer.play(loaded.code);
			sketchWorkspace.addLog(log);
		} else if (sketchWorkspace.loaded) {
			await audioPlayer.play(sketchWorkspace.loaded.code);
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header>
	<div class="header-main">
		<div class="transport-controls">
			<button onclick={handlePlay} disabled={!canPlay} aria-label={playLabel} title={playLabel}>
				{#if showRepeatIcon}
					<IconRepeat size={20} />
				{:else}
					<IconPlay size={20} fill="currentColor" />
				{/if}
			</button>
			<button
				onclick={() => audioPlayer.stop()}
				disabled={!audioPlayer.isRunning}
				aria-label="Stop sketch"
				title="Stop sketch"
			>
				<IconStop size={20} fill="currentColor" />
			</button>
			{#if sketchWorkspace.loaded?.title}
				<span class="track-title">{sketchWorkspace.loaded.title}</span>
			{/if}
		</div>

		{#if isRepl && sketchPersistence.showPublish}
			<button
				class="publish-btn"
				onclick={() => sketchPersistence.publish()}
				disabled={!sketchPersistence.canPublish}
				aria-label={!data.session.did ? 'Log in to publish' : 'Publish sketch'}
				title={!data.session.did ? 'Log in to publish' : 'Publish sketch'}
			>
				<IconPublish size={20} />
			</button>
		{/if}
	</div>

	<div class="header-right">
		<LoginButton session={data.session} />
	</div>
</header>
{@render children()}

<style>
	header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) clamp(280px, 24vw, 360px);
		align-items: center;
		block-size: var(--ui-header-block-size);
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.header-main {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-width: 0;
		padding-inline: 1rem;
	}

	.transport-controls,
	.header-right {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.header-right {
		justify-content: flex-end;
		padding-inline: 1rem;
	}

	button {
		display: flex;
		justify-content: center;
		align-items: center;
		block-size: 2.25rem;
		inline-size: 2.25rem;
		padding: 0;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: 100vmax;
		border: none;
		background: none;
		cursor: pointer;

		&:disabled {
			cursor: default;
			opacity: 0.5;
			color: var(--color-fg-tertiary);
		}
	}

	.track-title {
		margin-left: 0.75rem;
		overflow: hidden;
		color: var(--color-fg-secondary);
		font-size: 0.875rem;
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>

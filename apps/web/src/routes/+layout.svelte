<script lang="ts">
	import { page } from '$app/state';
	import LoginButton from '@/components/login-button/index.svelte';
	import IconPlay from '@/components/icons/icon-play.svelte';
	import IconPublish from '@/components/icons/icon-publish.svelte';
	import IconRepeat from '@/components/icons/icon-repeat.svelte';
	import IconStop from '@/components/icons/icon-stop.svelte';
	import favicon from '@/lib/assets/favicon.svg';
	import { globalControls } from '@/lib/client/global-controls.svelte';
	import '@/styles/global.css';

	let { children, data } = $props();

	const isRepl = $derived(page.url.pathname === '/repl');
	const isRunning = $derived(globalControls.isRunning);
	const canPlay = $derived(globalControls.canPlay);
	const playLabel = $derived(
		isRepl ? (isRunning ? 'Restart sketch' : 'Run sketch') : 'Play sketch'
	);
	const showRepeatIcon = $derived(isRepl && isRunning);

	async function handlePlay() {
		try {
			await globalControls.play();
		} catch {
			// error is set on audio.lastError; nothing more to do here
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
				onclick={() => globalControls.stop()}
				disabled={!globalControls.canStop}
				aria-label="Stop sketch"
				title="Stop sketch"
			>
				<IconStop size={20} fill="currentColor" />
			</button>
			{#if globalControls.title}
				<span class="track-title">{globalControls.title}</span>
			{/if}
		</div>

		{#if globalControls.showPublish}
			<button
				class="publish-btn"
				onclick={() => globalControls.publish()}
				disabled={!globalControls.canPublish}
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
		padding: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: 100vmax;
		border: none;
		background: none;
		/*color: var(--color-bg-primary);*/
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

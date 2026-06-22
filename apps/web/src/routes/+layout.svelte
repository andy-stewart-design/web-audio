<script lang="ts">
	import LoginButton from '@/components/login-button/index.svelte';
	import { page } from '$app/state';
	import favicon from '@/lib/assets/favicon.svg';
	import { audio } from '$lib/client/audio.svelte';
	import { replControls } from '$lib/client/repl-controls.svelte';
	import '@/styles/global.css';

	let { children, data } = $props();

	const isRunning = $derived(audio.isRunning);
	const isRepl = $derived(page.url.pathname === '/repl');
	const controls = $derived(isRepl ? replControls.controls : null);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header>
	<div class="header-main">
		<div class="transport-controls">
			<button onclick={() => controls?.run()} disabled={!controls}>Run</button>
			<button onclick={() => controls?.stop() ?? audio.stop()} disabled={!isRunning}>Stop</button>
			{#if controls?.title}
				<span class="track-title">{controls.title}</span>
			{/if}
		</div>

		{#if controls}
			<button
				class="publish-btn"
				onclick={controls.publish}
				disabled={!controls.canPublish}
				title={!data.session.did ? 'Log in to publish' : 'Publish sketch'}
			>
				Publish
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
		gap: 0.5rem;
	}

	.header-right {
		justify-content: flex-end;
		padding-inline: 1rem;
	}

	button {
		padding: 0.375rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: 100vmax;
		border: none;
		background: var(--color-fg-primary);
		color: var(--color-bg-primary);
		cursor: pointer;

		&:disabled {
			cursor: default;
			opacity: 0.5;
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

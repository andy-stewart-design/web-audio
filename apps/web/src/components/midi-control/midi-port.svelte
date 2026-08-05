<script lang="ts">
	import { onDestroy } from 'svelte';
	import IconCheck from '../icons/icon-check.svelte';
	import IconCopy from '../icons/icon-copy.svelte';
	import type { DevicePort } from './types';

	interface Props {
		port: DevicePort;
		onCopy(id: string): Promise<boolean>;
	}

	let { port, onCopy }: Props = $props();
	let copied = $state(false);
	let resetCopied: ReturnType<typeof setTimeout> | undefined;

	const portLabel = (port: DevicePort) => {
		if (port.input && port.output) return 'In/Out';
		return port.input ? 'In' : 'Out';
	};

	async function copy() {
		if (!(await onCopy(port.id))) return;

		copied = true;
		clearTimeout(resetCopied);
		resetCopied = setTimeout(() => (copied = false), 2_000);
	}

	onDestroy(() => clearTimeout(resetCopied));
</script>

<div class="port">
	<div class="port-metadata">
		<span class="port-type" data-role="surface-secondary">{portLabel(port)}</span>
		<span class="port-id">{port.id}</span>
	</div>
	<button
		class="copy"
		onclick={copy}
		aria-label={copied ? 'Copied' : 'Copy ID'}
		data-role={copied ? 'success' : undefined}
	>
		{#if copied}
			<IconCheck size={16} weight="thin" />
		{:else}
			<IconCopy size={16} weight="thin" />
		{/if}
	</button>
</div>

<style>
	.port {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem;
		min-inline-size: 0;
	}

	.port-metadata {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-inline-size: 0;
		user-select: none;
	}

	.port-type {
		flex: 0 0 auto;
		padding: 0.25rem 0.375rem;
		color: var(--color-foreground-primary);
		font: var(--font-label-small);
		background: var(--color-background-primary);
		border: 1px solid var(--color-border-subtle);
		border-radius: 4px;
	}

	.port-id {
		overflow: hidden;
		color: var(--color-foreground-secondary);
		font: var(--font-label-small);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.copy {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem;
		color: var(--color-foreground-primary);
		background: none;
		border: none;
		border-radius: 100vmax;
		cursor: pointer;

		&[data-role='success'] {
			color: var(--color-foreground-secondary);
		}
	}
</style>

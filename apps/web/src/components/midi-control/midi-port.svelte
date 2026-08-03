<script lang="ts">
	import IconCopy from '../icons/icon-copy.svelte';
	import type { DevicePort } from './types';

	interface Props {
		port: DevicePort;
		copiedId: string | null;
		onCopy(id: string): Promise<void>;
	}

	let { port, copiedId, onCopy }: Props = $props();

	const portLabel = (port: DevicePort) => {
		if (port.input && port.output) return 'In/Out';
		return port.input ? 'In' : 'Out';
	};
</script>

<div class="port">
	<div class="port-id">
		<span class="port-type" data-role="surface-tertiary">{portLabel(port)}</span>
		<code>{port.id}</code>
	</div>
	<button
		class="copy"
		onclick={() => onCopy(port.id)}
		aria-label={copiedId === port.id ? 'Copied' : 'Copy ID'}
	>
		<IconCopy size={16} weight="thin" />
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

	.port-id {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-inline-size: 0;

		code {
			overflow: hidden;
			color: var(--color-foreground-secondary);
			font-size: var(--font-2xs);
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}

	.port-type {
		flex: 0 0 auto;
		padding: 0.1rem 0.3rem;
		color: var(--color-foreground-secondary);
		font-size: var(--font-2xs);
		font-weight: 600;
		background: var(--color-background-primary);
		border: 1px solid var(--color-border-subtle);
		border-radius: 4px;
	}

	.copy {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem;
		color: var(--color-foreground-secondary);
		font-size: var(--font-2xs);
		background: none;
		border: none;
		border-radius: 100vmax;
		cursor: pointer;
	}
</style>

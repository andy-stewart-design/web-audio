<script lang="ts">
	import MidiPort from './midi-port.svelte';
	import type { MidiStatus } from '@web-audio/midi';
	import type { Device } from './types';

	interface Props {
		status: MidiStatus | 'disabled';
		devices: Device[];
		copiedId: string | null;
		onCopy(id: string): Promise<void>;
	}

	let { status, devices, copiedId, onCopy }: Props = $props();
</script>

{#if status === 'disabled'}
	<div class="device-placeholder" data-role="surface-tertiary">
		Enable MIDI to see available devices
	</div>
{:else if status === 'pending'}
	<div class="device-placeholder connecting" data-role="surface-tertiary">
		Looking for MIDI devices…
	</div>
{:else if status === 'connected' && devices.length > 0}
	<ul>
		{#each devices as device (device.key)}
			<li data-role="surface-tertiary">
				<strong>{device.name ?? 'Unnamed device'}</strong>
				<div class="ports">
					{#each device.ports as port (port.id)}
						<MidiPort {port} {copiedId} {onCopy} />
					{/each}
				</div>
			</li>
		{/each}
	</ul>
{:else if status === 'connected'}
	<div class="device-placeholder" data-role="surface-tertiary">No MIDI devices connected</div>
{:else}
	<div class="device-placeholder" data-role="surface-tertiary">
		Turn MIDI off and on to try again
	</div>
{/if}

<style>
	.device-placeholder {
		display: grid;
		place-items: center;
		min-block-size: 10rem;
		padding: 1rem;
		color: var(--color-foreground-tertiary);
		font: var(--font-body-small);
		text-align: center;
		border-radius: 0.5rem;
		background: var(--color-background-primary);
		border: 1px solid var(--color-border-subtle);
	}

	.device-placeholder.connecting {
		color: #568bd6;
	}

	ul {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		gap: 0.375rem;
		padding: 0.5rem;
		border-radius: 0.375rem;
		background: var(--color-background-primary);
		border: 1px solid var(--color-border-subtle);
	}

	li > strong {
		overflow: hidden;
		font: var(--font-body-small);
		font-weight: var(--font-bold);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ports {
		display: flex;
		gap: 0.75rem;
	}
</style>

<script lang="ts">
	import { audio } from '@/lib/globals';
	import IconMidi from '@/components/icons/icon-midi.svelte';
	import IconCopy from '@/components/icons/icon-copy.svelte';
	import MidiToggle from './midi-toggle.svelte';
	import MidiSignal from './midi-signal.svelte';

	let open = $state(false);
	let copiedId = $state<string | null>(null);
	let copyError = $state(false);

	type DevicePort = { id: string; input: boolean; output: boolean };
	type Device = { key: string; name: string | null; ports: DevicePort[] };

	const devices = $derived.by(() => {
		const grouped: Device[] = [];
		const add = (device: { id: string; name: string | null }, direction: 'input' | 'output') => {
			const key = device.name === null ? `id:${device.id}` : `name:${device.name}`;
			let group = grouped.find((candidate) => candidate.key === key);
			if (!group) {
				group = { key, name: device.name, ports: [] };
				grouped.push(group);
			}
			let port = group.ports.find(({ id }) => id === device.id);
			if (!port) {
				port = { id: device.id, input: false, output: false };
				group.ports.push(port);
			}
			port[direction] = true;
		};

		audio.midiInputs.forEach((device) => add(device, 'input'));
		audio.midiOutputs.forEach((device) => add(device, 'output'));
		return grouped;
	});

	const portLabel = (port: DevicePort) => {
		if (port.input && port.output) return 'In/Out';
		return port.input ? 'In' : 'Out';
	};

	const statusLabel = $derived.by(() => {
		switch (audio.midiStatus) {
			case 'disabled':
				return 'MIDI disabled';
			case 'pending':
				return 'MIDI connecting…';
			case 'connected':
				return 'MIDI connected';
			case 'denied':
				return 'MIDI permission denied';
			case 'unavailable':
				return 'MIDI unavailable';
			case 'error':
				return 'MIDI error';
			case 'destroyed':
				return 'MIDI destroyed';
		}
	});

	function toggle() {
		open = !open;
	}

	function toggleMidi() {
		if (audio.midiStatus === 'disabled') audio.enableMidi();
		else audio.disableMidi();
		copiedId = null;
		copyError = false;
	}

	async function copyId(id: string) {
		try {
			await navigator.clipboard.writeText(id);
			copiedId = id;
			copyError = false;
		} catch {
			copiedId = null;
			copyError = true;
		}
	}
</script>

<div class="midi-control">
	<button
		class="trigger"
		onclick={toggle}
		aria-label={`${statusLabel}. Open settings`}
		aria-expanded={open}
		title={statusLabel}
	>
		<IconMidi size={20} />
		<span class="trigger-signal">
			<MidiSignal status={audio.midiStatus} visible={audio.midiStatus !== 'disabled'} />
		</span>
	</button>

	{#if open}
		<div class="popover" role="dialog" aria-label="MIDI settings">
			<MidiToggle
				status={audio.midiStatus}
				label={statusLabel}
				error={audio.midiError}
				ontoggle={toggleMidi}
			/>

			<section>
				<h2>Devices</h2>
				{#if audio.midiStatus === 'disabled'}
					<div class="device-placeholder">Enable MIDI to see available devices</div>
				{:else if audio.midiStatus === 'pending'}
					<div class="device-placeholder connecting">Looking for MIDI devices…</div>
				{:else if audio.midiStatus === 'connected' && devices.length > 0}
					<ul>
						{#each devices as device (device.key)}
							<li>
								<strong>{device.name ?? 'Unnamed device'}</strong>
								<div class="ports">
									{#each device.ports as port (port.id)}
										<div class="port">
											<div class="port-id">
												<span class="direction">{portLabel(port)}</span>
												<code>{port.id}</code>
											</div>
											<button
												class="copy"
												onclick={() => copyId(port.id)}
												aria-label={copiedId === port.id ? 'Copied' : 'Copy ID'}
											>
												<IconCopy size={16} />
											</button>
										</div>
									{/each}
								</div>
							</li>
						{/each}
					</ul>
				{:else if audio.midiStatus === 'connected'}
					<div class="device-placeholder">No MIDI devices connected</div>
				{:else}
					<div class="device-placeholder">Turn MIDI off and on to try again</div>
				{/if}
			</section>

			{#if copyError}<p class="copy-error">Could not copy the device ID.</p>{/if}
		</div>
	{/if}
</div>

<style>
	.midi-control {
		position: relative;
	}

	button {
		font: inherit;
	}

	.trigger {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: center;
		block-size: 2.25rem;
		inline-size: 2.25rem;
		padding: 0;
		color: var(--color-fg-primary);
		border: none;
		border-radius: 100vmax;
		background: none;
		cursor: pointer;

		&:is(:hover, [aria-expanded='true']) {
			background: var(--color-bg-secondary);
		}

		.trigger-signal {
			display: inline-flex;
			position: absolute;
			inset-block-end: 0.2rem;
			inset-inline-end: 0.15rem;
		}
	}

	.popover {
		position: absolute;
		z-index: 20;
		inset-block-start: calc(100% + 0.5rem);
		inset-inline-end: 0;
		inline-size: min(24rem, calc(100vw - 2rem));
		max-block-size: calc(100vh - var(--ui-header-block-size) - 2rem);
		overflow: auto;
		padding: 1rem;
		border: 1px solid var(--color-border-subtle);
		border-radius: 0.75rem;
		background: var(--color-bg-primary);
		box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 18%);
	}

	strong,
	h2,
	p {
		margin: 0;
	}

	.copy-error {
		margin-block-start: 0.2rem;
		color: var(--color-fg-secondary);
		font-size: 0.75rem;
	}

	section {
		margin-block-start: 1rem;
	}

	h2 {
		margin-block-end: 0.375rem;
		color: var(--color-fg-secondary);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.device-placeholder {
		display: grid;
		place-items: center;
		min-block-size: 10rem;
		padding: 1rem;
		color: var(--color-fg-tertiary);
		font-size: var(--font-sm);
		text-align: center;
		border-radius: 0.5rem;
		background: var(--color-bg-secondary);
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
		background: var(--color-bg-secondary);
	}

	li > strong {
		overflow: hidden;
		font-size: var(--font-sm);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ports {
		display: flex;
		gap: 0.75rem;
	}

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
	}

	code {
		overflow: hidden;
		color: var(--color-fg-secondary);
		font-size: var(--font-2xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.direction {
		flex: 0 0 auto;
		padding: 0.1rem 0.3rem;
		color: var(--color-fg-secondary);
		font-size: var(--font-2xs);
		font-weight: 600;
		border: 1px solid var(--color-border-subtle);
		border-radius: 4px;
		background: var(--color-bg-primary);
	}

	.copy {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem;
		color: var(--color-fg-secondary);
		font-size: var(--font-2xs);
		background: none;
		border: none;
		border-radius: 100vamx;
		cursor: pointer;
	}

	.copy-error {
		color: #d65c5c;
	}
</style>

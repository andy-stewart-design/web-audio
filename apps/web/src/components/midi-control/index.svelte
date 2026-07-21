<script lang="ts">
	import { audio } from '@/lib/globals';
	import IconMidi from '@/components/icons/icon-midi.svelte';
	import MidiToggle from './midi-toggle.svelte';
	import MidiSignal from './midi-signal.svelte';
	import MidiDevices from './midi-devices.svelte';
	import { getMidiStatus, groupDevices } from './utils';

	let open = $state(false);
	let copiedId = $state<string | null>(null);
	let copyError = $state(false);

	const devices = $derived.by(() => groupDevices(audio.midiInputs, audio.midiOutputs));
	const statusLabel = $derived.by(() => getMidiStatus(audio.midiStatus));

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
				<MidiDevices status={audio.midiStatus} {devices} {copiedId} onCopy={copyId} />
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

	.copy-error {
		margin-block-start: 0.2rem;
		color: var(--color-fg-secondary);
		font-size: 0.75rem;
		color: #d65c5c;
	}

	section {
		margin-block-start: 1rem;
	}

	:is(h2, p) {
		margin: 0;
	}

	h2 {
		margin-block-end: 0.375rem;
		color: var(--color-fg-secondary);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
</style>

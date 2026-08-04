<script lang="ts">
	import { audio } from '@/lib/globals';
	import Popover from '@/components/core/popover/index.svelte';
	import MidiToggle from './midi-toggle.svelte';
	import MidiSignal from './midi-signal.svelte';
	import MidiDevices from './midi-devices.svelte';
	import { getMidiStatus, groupDevices } from './utils';
	import IconLink from '../icons/icon-link.svelte';

	let copiedId = $state<string | null>(null);
	let copyError = $state(false);

	const devices = $derived.by(() => groupDevices(audio.midiInputs, audio.midiOutputs));
	const statusLabel = $derived.by(() => getMidiStatus(audio.midiDisplayStatus));

	function toggleMidi() {
		audio.toggleMidi();
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

<Popover ariaLabel="MIDI settings">
	{#snippet trigger({ trigger, props })}
		<button
			use:trigger
			{...props}
			class="trigger"
			aria-label={`${statusLabel}. ${props['aria-expanded'] ? 'Close' : 'Open'} settings`}
			title={statusLabel}
		>
			<IconLink size={20} />
			<span class="trigger-signal">
				<MidiSignal
					status={audio.midiDisplayStatus}
					visible={audio.midiDisplayStatus !== 'disabled'}
				/>
			</span>
		</button>
	{/snippet}

	{#snippet content({ popover, props })}
		<div use:popover {...props} class="popover" data-role="surface-secondary">
			<MidiToggle
				status={audio.midiDisplayStatus}
				label={statusLabel}
				error={audio.midiError}
				ontoggle={toggleMidi}
			/>

			<section>
				<h2>Devices</h2>
				<MidiDevices status={audio.midiDisplayStatus} {devices} {copiedId} onCopy={copyId} />
			</section>

			{#if copyError}<p class="copy-error">Could not copy the device ID.</p>{/if}
		</div>
	{/snippet}
</Popover>

<style>
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
		color: var(--color-foreground-primary);
		border: none;
		border-radius: 100vmax;
		background: none;
		cursor: pointer;

		&:focus-visible {
			outline: 2px solid currentColor;
			outline-offset: 2px;
		}

		&:is(:hover, [aria-expanded='true']) {
			background: var(--color-background-secondary);
		}

		.trigger-signal {
			display: inline-flex;
			position: absolute;
			inset-block-end: 0.2rem;
			inset-inline-end: 0.15rem;
		}
	}

	.popover {
		inline-size: min(24rem, calc(100vw - 2rem));
		max-block-size: calc(100vh - var(--ui-header-block-size) - 2rem);
		overflow: auto;
		padding: 1rem;
		border: 1px solid var(--color-border-subtle);
		border-radius: 0.75rem;
		background: var(--color-background-primary);
		box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 18%);
	}

	.copy-error {
		margin-block-start: 0.2rem;
		color: var(--color-foreground-secondary);
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
		color: var(--color-foreground-secondary);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
</style>

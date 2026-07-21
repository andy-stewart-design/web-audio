<script lang="ts">
	import Switch from '@/components/core/switch/index.svelte';
	import MidiSignal from './midi-signal.svelte';
	import type { MidiStatus } from '@web-audio/midi';

	interface Props {
		status: MidiStatus | 'disabled';
		displayStatus: MidiStatus | 'disabled';
		label: string;
		error: string | null;
		ontoggle(): void;
	}

	let { status, displayStatus, label, error, ontoggle }: Props = $props();
</script>

<label class="status-row">
	<div class="status-label">
		<MidiSignal status={displayStatus} size="md" />
		<div class="status-text">
			<strong>{label}</strong>
			{#if error}
				<p>{error}</p>
			{/if}
		</div>
	</div>
	<Switch
		checked={status !== 'disabled'}
		pending={displayStatus === 'pending'}
		onchange={ontoggle}
	/>
</label>

<style>
	.status-row {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		cursor: pointer;
		user-select: none;
	}

	.status-label {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.status-text {
		margin-block-end: 2px;
	}

	strong,
	p {
		margin: 0;
	}

	.status-row strong {
		font-size: 0.875rem;
	}

	.status-row p {
		margin-block-start: 0.2rem;
		color: var(--color-fg-secondary);
		font-size: 0.75rem;
	}
</style>

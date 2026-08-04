<script lang="ts">
	import Switch from '@/components/core/switch/index.svelte';
	import MidiSignal from './midi-signal.svelte';
	import type { MidiStatus } from '@web-audio/midi';

	interface Props {
		status: MidiStatus | 'disabled';
		label: string;
		error: string | null;
		ontoggle(): void;
	}

	let { status, label, error, ontoggle }: Props = $props();
</script>

<label class="status-row">
	<div class="status-label">
		<MidiSignal {status} size="md" />
		<div class="status-text">
			<strong>{label}</strong>
		</div>
	</div>
	<Switch
		checked={status !== 'disabled'}
		pending={status === 'pending'}
		error={!!error}
		onchange={ontoggle}
	/>
</label>

{#if error}
	<p class="error">{error}</p>
{/if}

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

	:is(strong, p) {
		margin: 0;
	}

	.status-text {
		margin-block-end: 2px;

		strong {
			font: var(--font-body-small);
			font-weight: var(--font-bold);
		}
	}

	.error {
		margin-block-start: 0.5rem;
		color: #d65c5c;
		font-weight: 500;
		font-size: 0.75rem;
	}
</style>

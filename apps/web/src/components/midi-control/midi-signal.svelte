<script lang="ts">
	import type { MidiStatus } from '@web-audio/midi';

	interface Props {
		status: MidiStatus | 'disabled';
		visible?: boolean;
		size?: 'sm' | 'md';
	}

	let { status, visible = true, size = 'sm' }: Props = $props();
</script>

<span class="signal" data-state={status} data-size={size} data-visible={visible}></span>

<style>
	.signal {
		--size: 0.375rem;

		flex: 0 0 auto;
		block-size: var(--size);
		inline-size: var(--size);
		outline: 1px solid var(--color-bg-primary);
		border-radius: 100vmax;
		background: var(--color-fg-tertiary);

		&[data-size='md'] {
			--size: 0.625rem;
		}

		&[data-visible='false'] {
			opacity: 0;
		}

		&[data-state='pending'] {
			background: #568bd6;
			animation: pulse 1.2s ease-in-out infinite;
		}

		&[data-state='connected'] {
			background: #42a66c;
		}

		&:is([data-state='denied'], [data-state='error']) {
			background: #d65c5c;
		}

		&:is([data-state='unavailable'], [data-state='destroyed']) {
			background: #b78a3d;
		}
	}

	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}
</style>

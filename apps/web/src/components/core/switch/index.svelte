<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLInputElement> {
		checked?: boolean;
		pending?: boolean;
		error?: boolean;
	}

	type SwitchStatus = 'checked' | 'pending' | 'unchecked' | 'error';

	let { checked = false, pending = false, error = false, ...props }: Props = $props();

	let status: SwitchStatus = $derived(
		error ? 'error' : pending ? 'pending' : checked ? 'checked' : 'unchecked'
	);
</script>

<input {...props} data-state={status} class="switch" type="checkbox" {checked} />

<style>
	.switch {
		--switch-block-size: 1.5rem;
		--switch-inline-size: 2.5rem;
		--switch-thumb-offset: 0.175rem;
		--switch-thumb-size: calc(var(--switch-block-size) - 2 * var(--switch-thumb-offset));
		--switch-checked-translate: calc(
			var(--switch-inline-size) - var(--switch-thumb-size) - 2 * var(--switch-thumb-offset)
		);

		position: relative;
		flex: 0 0 auto;
		appearance: none;
		block-size: var(--switch-block-size);
		inline-size: var(--switch-inline-size);
		margin: 0;
		padding: 0.2rem;
		border: none;
		border-radius: 100vmax;
		background: var(--color-fg-tertiary);
		cursor: pointer;
		transition: background 120ms ease;
		overflow: clip;

		&[data-state='checked'] {
			background: #42a66c;
		}

		&[data-state='pending'] {
			background: #568bd6;
		}

		&[data-state='error'] {
			background: #d65c5c;
		}

		&:not([data-state='unchecked'])::after {
			translate: var(--switch-checked-translate) 0;
		}

		&:focus-visible {
			outline: 2px solid currentColor;
			outline-offset: 2px;
		}

		&::after {
			position: absolute;
			inset-block-start: var(--switch-thumb-offset);
			inset-inline-start: var(--switch-thumb-offset);
			block-size: var(--switch-thumb-size);
			inline-size: var(--switch-thumb-size);
			border-radius: 50%;
			background: var(--color-fg-primary);
			box-shadow: 0 1px 4px rgb(0 0 0 / 25%);
			content: '';
			transition: translate 120ms ease;
		}
	}
</style>

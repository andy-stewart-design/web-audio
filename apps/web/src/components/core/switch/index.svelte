<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLInputElement> {
		checked?: boolean;
		pending?: boolean;
	}

	type SwitchStatus = 'checked' | 'pending' | 'unchecked';

	let { checked = false, pending = false, ...props }: Props = $props();

	let status: SwitchStatus = $derived(pending ? 'pending' : checked ? 'checked' : 'unchecked');
</script>

<input {...props} data-state={status} class="switch" type="checkbox" {checked} />

<style>
	.switch {
		position: relative;
		flex: 0 0 auto;
		appearance: none;
		block-size: 1.625rem;
		inline-size: 3rem;
		margin: 0;
		padding: 0.2rem;
		border: none;
		border-radius: 100vmax;
		background: var(--color-fg-tertiary);
		cursor: pointer;
		transition: background 120ms ease;

		&[data-state='checked'] {
			background: #42a66c;
		}

		&[data-state='pending'] {
			background: #568bd6;
		}

		&:is([data-state='checked'], [data-state='pending'])::after {
			translate: 1.25rem 0;
		}

		&:focus-visible {
			outline: 2px solid currentColor;
			outline-offset: 2px;
		}

		&::after {
			position: absolute;
			inset-block-start: 0.2rem;
			inset-inline-start: 0.2rem;
			block-size: 1.25rem;
			inline-size: 1.25rem;
			border-radius: 50%;
			background: var(--color-bg-primary);
			box-shadow: 0 1px 3px rgb(0 0 0 / 25%);
			content: '';
			transition: translate 120ms ease;
		}
	}
</style>

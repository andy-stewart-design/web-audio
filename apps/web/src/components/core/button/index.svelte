<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes, HTMLAnchorAttributes } from 'svelte/elements';

	type BaseProps = {
		children: Snippet;
		variant?: 'primary' | 'secondary' | 'tertiary';
	};

	type ButtonProps = BaseProps & HTMLButtonAttributes & { href?: never };
	type LinkProps = BaseProps & HTMLAnchorAttributes & { href: string; onclick?: never };

	type Props = ButtonProps | LinkProps;

	let { variant = 'primary', class: className, ...props }: Props = $props();

	const tag = $derived(props.href ? 'a' : 'button');
	const role = $derived(`surface-${variant}`);
</script>

<svelte:element
	this={tag}
	{...props}
	class={['button', className]}
	data-variant={variant}
	data-role={role}
>
	{@render props.children()}
</svelte:element>

<style>
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		block-size: 2.5rem;
		padding: 0 1rem 1px;
		font-size: 0.875rem;
		font-weight: 600;
		border: 1px solid transparent;
		border-radius: 3px;
		text-decoration: none;
		cursor: pointer;
		background: none;
		color: inherit;

		&[data-variant='primary'] {
			color: var(--color-background-primary);
			background: var(--color-foreground-primary);
			font-weight: 700;

			&:hover {
				opacity: 0.8;
			}
		}

		&[data-variant='secondary'] {
			color: var(--color-foreground-primary);
			background: transparent;
			border-color: var(--color-border-strong);

			&:hover {
				border-color: var(--color-border);
			}
		}

		&[data-variant='tertiary'] {
			color: var(--color-foreground-primary);
			background: transparent;
			border-color: var(--color-border-subtle);

			&:hover {
				border-color: var(--color-border-strong);
			}
		}
	}
</style>

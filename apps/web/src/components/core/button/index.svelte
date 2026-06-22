<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes, HTMLAnchorAttributes } from 'svelte/elements';

	type BaseProps = {
		children: Snippet;
		active?: boolean;
	};

	type ButtonProps = BaseProps & HTMLButtonAttributes & { href?: never };
	type LinkProps = BaseProps & HTMLAnchorAttributes & { href: string; onclick?: never };

	type Props = ButtonProps | LinkProps;

	let { active, ...props }: Props = $props();
	const tag = $derived(props.href ? 'a' : 'button');
</script>

<svelte:element this={tag} {...props} class={['button', active && 'active']}>
	{@render props.children()}
</svelte:element>

<style>
	.button {
		display: inline-flex;
		align-items: center;
		block-size: 2rem;
		padding: 0 0.75rem 1px;
		font-size: 0.8rem;
		font-weight: 500;
		border: 1px solid var(--color-border-subtle);
		border-radius: 3px;
		text-decoration: none;
		cursor: pointer;
		background: none;
		color: inherit;

		&:hover {
			color: var(--color-fg-secondary);
		}

		&.active {
			border-color: currentColor;
		}
	}
</style>

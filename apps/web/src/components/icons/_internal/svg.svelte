<script lang="ts">
	import type { IconProps } from './types';

	let { size = 24, weight = 'default', children, fill = 'none', ...props }: IconProps = $props();
</script>

<svg
	{...props}
	viewBox="0 0 24 24"
	width={size}
	height={size}
	stroke="currentColor"
	stroke-width={weight === 'default' ? 2 : 1.5}
	stroke-linejoin="round"
	stroke-linecap="round"
	{fill}
>
	{@render children?.()}
</svg>

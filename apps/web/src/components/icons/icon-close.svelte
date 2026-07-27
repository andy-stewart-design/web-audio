<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';

	interface Props extends SVGAttributes<SVGSVGElement> {
		size?: number;
	}

	let { size = 24, fill = 'none', ...props }: Props = $props();
</script>

<svg
	viewBox="0 0 24 24"
	width={size}
	height={size}
	stroke="currentColor"
	stroke-width={2}
	stroke-linejoin="round"
	stroke-linecap="round"
	{fill}
	{...props}
>
	<path d="M 4 4 L 20 20 M 4 20 L 20 4" vector-effect="non-scaling-stroke" />
</svg>

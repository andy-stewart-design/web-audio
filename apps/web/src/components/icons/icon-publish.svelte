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
	<path
		d="M19 9L12 2L5 9M12 2V16M4 18V21C4 21.5523 4.44772 22 5 22H19C19.5523 22 20 21.5523 20 21V18"
		vector-effect="non-scaling-stroke"
	/>
</svg>

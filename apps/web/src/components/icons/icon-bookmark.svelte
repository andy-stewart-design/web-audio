<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';

	interface Props extends SVGAttributes<SVGSVGElement> {
		size?: number;
	}

	let { size = 24, ...props }: Props = $props();
</script>

<svg
	viewBox="0 0 24 24"
	width={size}
	height={size}
	stroke="currentColor"
	stroke-width={1.5}
	stroke-linejoin="round"
	stroke-linecap="round"
	{...props}
>
	<path
		d="M 9 3 L 15 3 Q 18 3 18 6 L 18 21 L 12 15 L 6 21 L 6 6 Q 6 3 9 3 Z"
		vector-effect="non-scaling-stroke"
	/>
</svg>

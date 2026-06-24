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
		d="M19 21V6C19 4.5 17.5 3 16 3L8 3C6.5 3 5 4.5 5 6V21L12 16L19 21Z"
		vector-effect="non-scaling-stroke"
	/>
</svg>

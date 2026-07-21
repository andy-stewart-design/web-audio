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
	stroke-width={1.5}
	stroke-linejoin="round"
	stroke-linecap="round"
	{fill}
	{...props}
>
	<path
		d="M4 15C2.89543 15 2 14.1046 2 13V4C2 2.89543 2.89543 2 4 2H13C14.1046 2 15 2.89543 15 4M11 22H20C21.1046 22 22 21.1046 22 20V11C22 9.89543 21.1046 9 20 9H11C9.89543 9 9 9.89543 9 11V20C9 21.1046 9.89543 22 11 22Z"
		vector-effect="non-scaling-stroke"
	/>
</svg>

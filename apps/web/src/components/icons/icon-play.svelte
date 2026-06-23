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
		d="M4 3.95705C4 2.41902 5.66361 1.45658 6.99694 2.22324L20.9847 10.2662C22.3221 11.0352 22.3221 12.9648 20.9847 13.7338L6.99694 21.7768C5.66361 22.5434 4 21.581 4 20.0429L4 3.95705Z"
		vector-effect="non-scaling-stroke"
	/>
</svg>

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
		d="M17 10L21 6L17 2M21 6H7C5.93913 6 4.92172 6.42143 4.17157 7.17157C3.42143 7.92172 3 8.93913 3 10V11M7 14L3 18L7 22M3 18H17C18.0609 18 19.0783 17.5786 19.8284 16.8284C20.5786 16.0783 21 15.0609 21 14V13"
		vector-effect="non-scaling-stroke"
	/>
</svg>

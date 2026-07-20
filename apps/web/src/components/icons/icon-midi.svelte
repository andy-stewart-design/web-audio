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
		d="M10.4881 15.4082C9.59798 15.9286 9 16.8945 9 18C9 19.6569 10.3431 21 12 21C13.6569 21 15 19.6569 15 18C15 16.8945 14.402 15.9286 13.5119 15.4082C13.0679 15.1487 12.5513 15 12 15C11.4487 15 10.9321 15.1487 10.4881 15.4082ZM13.5119 15.4082L17.4881 8.59176M10.4881 15.4082L6.51186 8.59176M6.51186 8.59176C7.40202 8.07138 8 7.10552 8 6C8 4.34315 6.65685 3 5 3C3.34314 3 2 4.34315 2 6C2 7.65685 3.34315 9 5 9C5.55133 9 6.06793 8.85128 6.51186 8.59176ZM17.4881 8.59176C17.9321 8.85128 18.4487 9 19 9C20.6569 9 22 7.65685 22 6C22 4.34314 20.6569 3 19 3C17.3431 3 16 4.34315 16 6C16 7.10552 16.598 8.07138 17.4881 8.59176Z"
		vector-effect="non-scaling-stroke"
	/>
</svg>

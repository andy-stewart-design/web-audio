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
		d="M5.5 10C7.433 10 9 8.433 9 6.5C9 4.567 7.433 3 5.5 3C3.567 3 2 4.567 2 6.5C2 8.433 3.567 10 5.5 10ZM5.5 10V12.5C5.5 14.6676 6.74518 16.5667 8.61127 17.6211M18.5 10C20.433 10 22 8.433 22 6.5C22 4.567 20.433 3 18.5 3C16.567 3 15 4.567 15 6.5C15 8.433 16.567 10 18.5 10ZM18.5 10V12.5C18.5 14.6676 17.2548 16.5667 15.3887 17.6211M15.3887 17.6211C15.3035 17.2914 15.1714 16.9806 15 16.6962C14.3876 15.6798 13.2732 15 12 15C10.7268 15 9.61245 15.6798 9 16.6962C8.82861 16.9806 8.69653 17.2914 8.61127 17.6211C8.53864 17.9019 8.5 18.1965 8.5 18.5C8.5 20.433 10.067 22 12 22C13.933 22 15.5 20.433 15.5 18.5C15.5 18.1965 15.4614 17.9019 15.3887 17.6211Z"
		vector-effect="non-scaling-stroke"
	/>
</svg>

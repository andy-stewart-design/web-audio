<script lang="ts">
	import Svg from './_internal/svg.svelte';
	import Path from './_internal/path.svelte';
	import type { IconProps } from './_internal/types';

	let props: IconProps = $props();
</script>

<Svg {...props}>
	<Path
		d="M11.5355 19.5356C9.58291 21.4882 6.41709 21.4882 4.46447 19.5356C2.51184 17.5829 2.51184 14.4171 4.46447 12.4645L5.99999 10.929M11.5 19.5L13 18M11 5.92893L12.4645 4.46447C14.4171 2.51184 17.5829 2.51184 19.5356 4.46447C21.4882 6.41709 21.4882 9.58291 19.5356 11.5355L18.0711 13M8.99999 15L15 8.99999"
	/>
</Svg>

<script lang="ts">
	import Svg from './_internal/svg.svelte';
	import Path from './_internal/path.svelte';
	import type { IconProps } from './_internal/types';

	let props: IconProps = $props();
</script>

<Svg {...props}>
	<Path
		d="M19 9L12 2L5 9M12 2V16M4 18V21C4 21.5523 4.44772 22 5 22H19C19.5523 22 20 21.5523 20 21V18"
	/>
</Svg>

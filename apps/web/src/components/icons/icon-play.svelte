<script lang="ts">
	import Svg from './_internal/svg.svelte';
	import Path from './_internal/path.svelte';
	import type { IconProps } from './_internal/types';

	let props: IconProps = $props();
</script>

<Svg {...props}>
	<Path
		d="M4 3.95705C4 2.41902 5.66361 1.45658 6.99694 2.22324L20.9847 10.2662C22.3221 11.0352 22.3221 12.9648 20.9847 13.7338L6.99694 21.7768C5.66361 22.5434 4 21.581 4 20.0429L4 3.95705Z"
	/>
</Svg>

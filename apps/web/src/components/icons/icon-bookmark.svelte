<script lang="ts">
	import Svg from './_internal/svg.svelte';
	import Path from './_internal/path.svelte';
	import type { IconProps } from './_internal/types';

	let props: IconProps = $props();
</script>

<Svg {...props}>
	<Path d="M19 21V6C19 4.5 17.5 3 16 3L8 3C6.5 3 5 4.5 5 6V21L12 16L19 21Z" />
</Svg>

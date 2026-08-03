<script lang="ts">
	import Svg from './_internal/svg.svelte';
	import Path from './_internal/path.svelte';
	import type { IconProps } from './_internal/types';

	let props: IconProps = $props();
</script>

<Svg {...props}>
	<Path d="M 4 4 L 20 20 M 4 20 L 20 4" />
</Svg>

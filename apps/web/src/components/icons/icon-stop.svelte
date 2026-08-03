<script lang="ts">
	import Svg from './_internal/svg.svelte';
	import type { IconProps } from './_internal/types';

	let props: IconProps = $props();
</script>

<Svg {...props}>
	<rect x="3" y="3" width="18" height="18" rx="2" vector-effect="non-scaling-stroke" />
</Svg>

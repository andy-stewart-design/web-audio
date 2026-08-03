<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';

	interface Props extends SVGAttributes<SVGPathElement> {
		size?: number;
	}

	let props: Props = $props();
</script>

<path {...props} vector-effect="non-scaling-stroke" />

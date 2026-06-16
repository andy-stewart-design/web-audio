<script lang="ts">
	let { children } = $props();
</script>

<main>
	{@render children()}
</main>

<style>
	main {
		height: calc(100dvh - var(--ui-header-block-size));
		min-height: 0;
		overflow: hidden;
	}
</style>

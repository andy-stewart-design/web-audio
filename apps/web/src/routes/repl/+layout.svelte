<script lang="ts">
	let { children } = $props();
</script>

<main>
	{@render children()}
</main>

<style>
	main {
		padding: 1rem;
	}
</style>

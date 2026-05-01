<script lang="ts">
	import LoginButton from '@/components/login-button/index.svelte';
	import favicon from '$lib/assets/favicon.svg';
	import '$lib/styles/global.css';

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header>
	<LoginButton did={data.did} />
</header>
{@render children()}

<style>
	header {
		padding: 1rem;
	}
</style>

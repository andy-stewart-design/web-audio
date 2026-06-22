<script lang="ts">
	import LoginButton from '@/components/login-button/index.svelte';
	import favicon from '@/lib/assets/favicon.svg';
	import '@/styles/global.css';

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header>
	<div class="header-right">
		<LoginButton session={data.session} />
	</div>
</header>
{@render children()}

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		block-size: var(--ui-header-block-size);
		padding-inline: 1rem;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
</style>

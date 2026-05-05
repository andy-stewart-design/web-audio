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
	<nav>
		<a href="/">home</a>
		<a href="/feed">feed</a>
		<a href="/repl">repl</a>
	</nav>
	<div class="header-right">
		<LoginButton session={data.session} />
	</div>
</header>
{@render children()}

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #45475a;
	}

	nav {
		display: flex;
		gap: 1.25rem;

		a {
			font-family: monospace;
			font-size: 0.875rem;
			color: #a6adc8;
			text-decoration: none;

			&:hover {
				color: #cdd6f4;
			}
		}
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

</style>

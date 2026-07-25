<script lang="ts">
	import IconUser from '@/components/icons/icon-user.svelte';

	interface Props {
		avatar: string | null;
		alt: string;
	}

	let { avatar, alt }: Props = $props();
</script>

{#if avatar}
	<img src={avatar} {alt} />
{:else}
	<IconUser fill="currentColor" />
{/if}

<style>
	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 100vmax;
	}

	:global(svg) {
		opacity: 0.666;
	}
</style>

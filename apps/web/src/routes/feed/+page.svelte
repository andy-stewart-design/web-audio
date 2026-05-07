<script lang="ts">
	import type { PageData } from './$types';
	import SketchCard from '@/components/sketch-card/index.svelte';

	let { data }: { data: PageData } = $props();
</script>

{#if data.sketches.length === 0}
	<div class="empty">
		{#if data.session?.did}
			<p>No sketches yet. Follow some people to see their work here.</p>
		{:else}
			<p>Log in to see sketches from people you follow.</p>
		{/if}
	</div>
{:else}
	<ul class="feed">
		{#each data.sketches as sketch (sketch.uri)}
			<li>
				<SketchCard {sketch} />
			</li>
		{/each}
	</ul>
{/if}

<style>
	.feed {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		list-style: none;
		padding: 0;
		max-width: 720px;
		margin: auto;
	}

	.empty {
		color: #585b70;
		font-size: 0.9rem;
	}
</style>

<script lang="ts">
	import type { PageData } from './$types';
	import SketchCard from '@/components/sketch-card/index.svelte';

	let { data }: { data: PageData } = $props();
</script>

{#if data.sketches.length === 0}
	<p class="empty">No bookmarks yet.</p>
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
	:is(.feed, .empty) {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		list-style: none;
		padding: 0;
		max-width: 720px;
		margin: auto;
	}

	.empty {
		color: var(--ui-color-fg-tertiary);
		font-size: 0.9375rem;
		text-align: center;
	}
</style>

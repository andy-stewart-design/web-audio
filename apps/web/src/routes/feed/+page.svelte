<script lang="ts">
	import type { PageData } from './$types';
	import SketchCard from '@/components/sketch-card/index.svelte';
	import type { SketchCard as SketchCardModel } from '@/lib/types/sketch';

	let { data }: { data: PageData } = $props();

	let extraSketches = $state<SketchCardModel[]>([]);
	let loadedCursor = $state<string | null>(null);
	let loadedHasMore = $state<boolean | null>(null);
	let loading = $state(false);

	// Reset client-loaded pages when server data refreshes (e.g. after invalidateAll)
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		data.sketches;
		extraSketches = [];
		loadedCursor = null;
		loadedHasMore = null;
	});

	const allSketches = $derived([...(data.sketches as SketchCardModel[]), ...extraSketches]);
	const hasMore = $derived(loadedHasMore ?? data.hasMore);
	const nextCursor = $derived(loadedCursor ?? data.nextCursor);

	async function loadMore() {
		if (!nextCursor || loading) return;
		loading = true;

		const res = await fetch(`/api/feed?cursor=${encodeURIComponent(nextCursor)}`);
		const next = await res.json();

		extraSketches = [...extraSketches, ...next.sketches];
		loadedCursor = next.nextCursor;
		loadedHasMore = next.hasMore;
		loading = false;
	}
</script>

{#if allSketches.length === 0}
	<div class="empty">
		{#if data.session?.did}
			<p>No sketches yet. Follow some people to see their work here.</p>
		{:else}
			<p>Log in to see sketches from people you follow.</p>
		{/if}
	</div>
{:else}
	<ul class="feed">
		{#each allSketches as sketch (sketch.uri)}
			<li>
				<SketchCard {sketch} />
			</li>
		{/each}
	</ul>

	{#if hasMore}
		<div class="more">
			<button onclick={loadMore} disabled={loading}>
				{loading ? 'Loading…' : 'Load more'}
			</button>
		</div>
	{/if}
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
		color: var(--color-fg-tertiary);
		font-size: 0.9375rem;
		text-align: center;
	}

	.more {
		display: flex;
		justify-content: center;
		padding-block: 1rem;
		max-width: 720px;
		margin: auto;
	}
</style>

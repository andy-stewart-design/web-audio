<script lang="ts">
	import type { SketchCard } from '$lib/server/atproto/reads';

	let { sketch }: { sketch: SketchCard } = $props();

	const formattedDate = $derived(
		new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
			new Date(sketch.createdAt)
		)
	);

	const authorLabel = $derived(
		sketch.authorDisplayName
			? `${sketch.authorDisplayName} (@${sketch.authorHandle})`
			: `@${sketch.authorHandle}`
	);
</script>

<article class="card">
	<header class="card-header">
		<div class="meta">
			<a href="/profile/{sketch.authorDid}" class="author">{authorLabel}</a>
			<time datetime={sketch.createdAt} class="date">{formattedDate}</time>
		</div>
		<h2 class="title">{sketch.title}</h2>
	</header>

	{#if sketch.description}
		<p class="description">{sketch.description}</p>
	{/if}

	{#if sketch.tags?.length}
		<ul class="tags">
			{#each sketch.tags as tag (tag)}
				<li class="tag">{tag}</li>
			{/each}
		</ul>
	{/if}

	<footer class="card-footer">
		<a href="/repl?load={encodeURIComponent(sketch.uri)}" class="play-btn">Play</a>
	</footer>
</article>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		background: var(--ui-color-bg-secondary);
		border: 1px solid var(--ui-color-border-subtle);
		border-radius: 6px;
	}

	.card-header {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.meta {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	.author {
		font-size: 0.8rem;
		text-decoration: none;

		&:hover {
			text-decoration: underline;
		}
	}

	.date {
		font-size: 0.75rem;
		color: var(--ui-color-fg-tertiary);
	}

	.title {
		font-size: 1.25rem;
		font-weight: 600;
	}

	.description {
		font-size: 0.875rem;
		color: var(--ui-color-fg-tertiary);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		list-style: none;
		padding: 0;
	}

	.tag {
		font-size: 0.75rem;
		padding: 0.125rem 0.5rem;
		background: var(--ui-color-bg-secondary);
		border-radius: 100vmax;
	}

	.card-footer {
		margin-top: 0.25rem;
	}

	.play-btn {
		display: inline-block;
		padding: 0.25rem 0.75rem 0.275rem;
		font-size: 0.8rem;
		font-weight: 500;
		border: 1px solid var(--ui-color-border-subtle);
		border-radius: 3px;
		text-decoration: none;

		&:hover {
			color: var(--ui-color-fg-secondary);
		}
	}
</style>

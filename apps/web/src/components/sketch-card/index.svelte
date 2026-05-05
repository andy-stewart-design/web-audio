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
			{#each sketch.tags as tag}
				<li class="tag">{tag}</li>
			{/each}
		</ul>
	{/if}

	<footer class="card-footer">
		<a href="/repl?load={encodeURIComponent(sketch.uri)}" class="play-btn">play</a>
	</footer>
</article>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		background: #1e1e2e;
		border: 1px solid #45475a;
		border-radius: 6px;
	}

	.card-header {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.meta {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	.author {
		font-size: 0.8rem;
		color: #89b4fa;
		text-decoration: none;

		&:hover {
			text-decoration: underline;
		}
	}

	.date {
		font-size: 0.75rem;
		color: #585b70;
	}

	.title {
		font-size: 1rem;
		font-weight: 600;
		color: #cdd6f4;
	}

	.description {
		font-size: 0.875rem;
		color: #a6adc8;
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
		background: #313244;
		color: #a6adc8;
		border-radius: 100vmax;
	}

	.card-footer {
		margin-top: 0.25rem;
	}

	.play-btn {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		font-family: monospace;
		font-size: 0.8rem;
		color: #a6e3a1;
		background: #1e1e2e;
		border: 1px solid #a6e3a1;
		border-radius: 4px;
		text-decoration: none;

		&:hover {
			background: #a6e3a1;
			color: #1e1e2e;
		}
	}
</style>

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { audio, sketchWorkspace } from '@/lib/globals';
	import IconBookmark from '@/components/icons/icon-bookmark.svelte';
	import type { SketchCard } from '@/lib/server/atproto/reads';
	import Button from '@/components/core/button/index.svelte';

	let { sketch }: { sketch: SketchCard } = $props();

	const isThisPlaying = $derived(sketchWorkspace.loaded?.uri === sketch.uri && audio.isRunning);
	const rkey = $derived(sketch.uri.split('/').at(-1));

	async function handleBookmark() {
		if (sketch.bookmarkUri) {
			await fetch('/api/bookmark', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bookmarkUri: sketch.bookmarkUri })
			});
		} else {
			await fetch('/api/bookmark', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ subjectUri: sketch.uri, subjectCid: sketch.cid })
			});
		}
		await invalidateAll();
	}

	const formattedDate = $derived(
		new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
			new Date(sketch.createdAt)
		)
	);

	const authorPrimaryLabel = $derived(
		sketch.authorDisplayName ? sketch.authorDisplayName : `@${sketch.authorHandle}`
	);

	const authorSecondaryLabel = $derived(
		sketch.authorDisplayName ? `@${sketch.authorHandle}` : undefined
	);

	async function handlePlay() {
		if (isThisPlaying) {
			audio.stop();
			return;
		}
		sketchWorkspace.load(sketch);
		await audio.play(sketch.code);
	}
</script>

<article class="card">
	<header>
		<div class="meta">
			{#if sketch.tags?.length}
				<ul class="tags">
					{#each sketch.tags.slice(0, 1) as tag (tag)}
						<li class="tag">{tag}</li>
					{/each}
				</ul>
			{/if}

			<time datetime={sketch.createdAt} class="date">{formattedDate}</time>
		</div>

		{#if page.data.session.did}
			<button
				class="bookmark"
				class:active={!!sketch.bookmarkUri}
				aria-label={sketch.bookmarkUri ? 'Remove bookmark' : 'Bookmark'}
				onclick={handleBookmark}
			>
				<IconBookmark
					size={24}
					fill={sketch.bookmarkUri ? 'currentColor' : undefined}
					opacity={sketch.bookmarkUri ? 1 : 0.5}
				/>
			</button>
		{/if}
	</header>

	<div class="main">
		<a href="/sketch/{sketch.authorDid}/{rkey}" class="title">{sketch.title}</a>

		{#if sketch.description}
			<p class="description">{sketch.description}</p>
		{/if}
	</div>

	<footer>
		<div>
			<a href="/profile/{sketch.authorDid}" class="author">
				{#if sketch.authorAvatar}
					<span class="avatar">
						<img src={sketch.authorAvatar} alt={authorPrimaryLabel} />
					</span>
				{/if}
				{authorPrimaryLabel}
				{#if authorSecondaryLabel}
					<span class="handle">{authorSecondaryLabel}</span>
				{/if}
			</a>

			<div class="controls">
				<Button active={isThisPlaying} onclick={handlePlay}>
					{isThisPlaying ? 'Stop' : 'Play'}
				</Button>
				<Button href="/repl?load={encodeURIComponent(sketch.uri)}">Remix</Button>
			</div>
		</div>
	</footer>
</article>

<style>
	.card {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border-subtle);
		border-radius: 6px;
	}

	/* HEADER ---------------------------------------- */

	header {
		display: flex;
		align-items: center;
		gap: 1rem;
		justify-content: space-between;
	}

	.meta {
		flex: 1 0 0;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		block-size: 3rem;
		padding-inline: 1rem;
		font-size: 0.75rem;
	}

	.date {
		color: var(--color-fg-tertiary);
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		list-style: none;
		padding: 0;
	}

	.bookmark {
		display: inline-flex;
		justify-content: center;
		place-items: center;
		block-size: 3rem;
		inline-size: 3rem;
		background: none;
		border: none;
	}

	/* MAIN ---------------------------------------- */

	.main {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem;
		padding-block: 0 1.25rem;

		.title {
			font-size: 1.25rem;
			font-weight: 600;
			text-decoration: none;
			color: inherit;

			&:hover {
				color: var(--color-fg-secondary);
			}
		}

		.description {
			font-size: 0.875rem;
			color: var(--color-fg-tertiary);
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}
	}

	/* FOOTER ---------------------------------------- */

	footer {
		padding: 1rem;
		padding-block-start: 0;

		& > div {
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 1rem;
			padding-block-start: 1rem;
			border-block-start: 1px solid var(--color-border-subtle);
		}
	}

	.author {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		text-decoration: none;

		.avatar {
			display: inline-block;
			block-size: 1.75rem;
			inline-size: 1.75rem;
			border-radius: 100vmax;
			background: var(--color-bg-primary);
			margin-inline-end: 0.125rem;

			img {
				width: 100%;
				height: 100%;
				object-fit: cover;
				border-radius: 100vmax;
			}
		}

		.handle {
			color: var(--color-fg-tertiary);
		}

		&:hover {
			color: var(--color-fg-secondary);
		}
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
</style>

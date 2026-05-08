<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { SketchCard } from '@/lib/server/atproto/reads';
	import { audio } from '@/lib/client/audio.svelte';
	import IconBookmark from '@/components/icons/icon-bookmark.svelte';

	let { sketch }: { sketch: SketchCard } = $props();

	const isThisPlaying = $derived(audio.currentUri === sketch.uri && audio.isRunning);

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
		try {
			await audio.play(sketch.code, sketch.uri);
		} catch {
			// error is set on audio.lastError; nothing more to do here
		}
	}
</script>

<article class="card">
	<header>
		<div class="meta">
			<time datetime={sketch.createdAt} class="date">{formattedDate}</time>

			{#if sketch.tags?.length}
				<ul class="tags">
					{#each sketch.tags as tag (tag)}
						<li class="tag">{tag}</li>
					{/each}
				</ul>
			{/if}
		</div>

		<button
			class="bookmark"
			class:active={!!sketch.bookmarkUri}
			aria-label={sketch.bookmarkUri ? 'Remove bookmark' : 'Bookmark'}
			onclick={handleBookmark}
		>
			<!-- <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
				<path
					d="M15.8334 17.5L10 13.3333L4.16669 17.5V4.16667C4.16669 3.72464 4.34228 3.30072 4.65484 2.98816C4.9674 2.67559 5.39133 2.5 5.83335 2.5H14.1667C14.6087 2.5 15.0326 2.67559 15.3452 2.98816C15.6578 3.30072 15.8334 3.72464 15.8334 4.16667V17.5Z"
					stroke="currentColor"
					fill={sketch.bookmarkUri ? 'currentColor' : undefined}
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg> -->
			<IconBookmark
				size={24}
				fill={sketch.bookmarkUri ? 'currentColor' : undefined}
				opacity={sketch.bookmarkUri ? 1 : 0.5}
			/>
		</button>
	</header>

	<div class="main">
		<h2 class="title">{sketch.title}</h2>

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
				<button class="control" class:active={isThisPlaying} onclick={handlePlay}>
					{isThisPlaying ? 'Stop' : 'Play'}
				</button>
				<a href="/repl?load={encodeURIComponent(sketch.uri)}" class="control">Remix</a>
			</div>
		</div>
	</footer>
</article>

<style>
	.card {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		background: var(--ui-color-bg-secondary);
		border: 1px solid var(--ui-color-border-subtle);
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
		/*padding-block-start: 1rem;*/

		.date {
			font-size: 0.75rem;
			color: var(--ui-color-fg-tertiary);
		}
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
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.75rem;
		padding: 1rem;
		padding-block: 0 1.25rem;

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
	}

	/* FOOTER ---------------------------------------- */

	footer {
		padding: 1rem;
		padding-block-start: 0;

		& > div {
			display: flex;
			align-items: center;
			gap: 1rem;
			padding-block-start: 1rem;
			border-block-start: 1px solid var(--ui-color-border-subtle);
		}
	}

	.author {
		flex: 1 0 0;
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
			background: var(--ui-color-bg-primary);
			margin-inline-end: 0.125rem;

			img {
				width: 100%;
				height: 100%;
				object-fit: cover;
				border-radius: 100vmax;
			}
		}

		.handle {
			color: var(--ui-color-fg-tertiary);
		}

		&:hover .handle {
			color: var(--ui-color-fg-primary);
		}
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.control {
		display: inline-flex;
		align-items: center;
		block-size: 2rem;
		padding: 0 0.75rem 1px;
		font-size: 0.8rem;
		font-weight: 500;
		border: 1px solid var(--ui-color-border-subtle);
		border-radius: 3px;
		text-decoration: none;
		cursor: pointer;
		background: none;
		color: inherit;

		&:hover {
			color: var(--ui-color-fg-secondary);
		}

		&.active {
			border-color: currentColor;
		}
	}
</style>

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import IconBookmark from '@/components/icons/icon-bookmark.svelte';
	import Button from '@/components/core/button/index.svelte';
	import { audio, workspace } from '@/lib/globals';

	let { data }: { data: PageData } = $props();

	const isPlaying = $derived(workspace.loaded?.uri === data.atUri && audio.isRunning);

	async function handlePlay() {
		if (isPlaying) {
			audio.stop();
			return;
		}
		const loadedSketch = { uri: data.atUri, title: data.sketch.title, code: data.sketch.code };
		workspace.load(loadedSketch);
		await audio.play(loadedSketch.code);
	}

	async function handleBookmark() {
		if (data.bookmarkUri) {
			await fetch('/api/bookmark', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bookmarkUri: data.bookmarkUri })
			});
		} else {
			await fetch('/api/bookmark', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ subjectUri: data.atUri, subjectCid: data.sketch.cid })
			});
		}
		await invalidateAll();
	}
</script>

<article class="sketch">
	<header>
		<div class="meta">
			{#if data.sketch.tags?.length}
				<ul class="tags">
					{#each data.sketch.tags as tag (tag)}
						<li class="tag">{tag}</li>
					{/each}
				</ul>
			{/if}

			<time datetime={data.sketch.createdAt}>{data.formattedDate}</time>
		</div>

		{#if page.data.session?.did}
			<button
				class="bookmark"
				class:active={!!data.bookmarkUri}
				aria-label={data.bookmarkUri ? 'Remove bookmark' : 'Bookmark'}
				onclick={handleBookmark}
			>
				<IconBookmark
					size={24}
					fill={data.bookmarkUri ? 'currentColor' : undefined}
					opacity={data.bookmarkUri ? 1 : 0.5}
				/>
			</button>
		{/if}
	</header>

	<div class="main">
		<h1 class="title">{data.sketch.title}</h1>

		{#if data.remixedFrom}
			<p class="remixed-from">
				Remixed from <a href={data.remixedFrom.href}>{data.remixedFrom.title}</a>
			</p>
		{/if}

		{#if data.sketch.description}
			<p class="description">{data.sketch.description}</p>
		{/if}
	</div>

	<footer>
		<a href="/profile/{data.profile.did}" class="author">
			{#if data.profile.avatar}
				<span class="avatar">
					<img src={data.profile.avatar} alt={data.authorPrimaryLabel} />
				</span>
			{/if}
			{data.authorPrimaryLabel}
			{#if data.authorSecondaryLabel}
				<span class="handle">{data.authorSecondaryLabel}</span>
			{/if}
		</a>

		<div class="controls">
			<Button active={isPlaying} onclick={handlePlay}>
				{isPlaying ? 'Stop' : 'Play'}
			</Button>
			<Button href="/repl?load={encodeURIComponent(data.atUri)}">Remix</Button>
		</div>
	</footer>

	<div class="code">
		<pre>{data.sketch.code}</pre>
	</div>
</article>

<style>
	.sketch {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		max-width: 720px;
		margin: auto;
		gap: 1.5rem;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.875rem;

		time {
			color: var(--color-fg-tertiary);
		}
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
		block-size: 2.5rem;
		inline-size: 2.5rem;
		background: none;
		border: none;
		cursor: pointer;
	}

	.main {
		display: grid;
		gap: 0.75rem;
		padding-block-end: 0.5rem;

		.title {
			font-size: 2rem;
			font-weight: 700;
		}

		.remixed-from {
			font-size: 0.875rem;
			color: var(--color-fg-tertiary);

			a {
				color: inherit;
				text-decoration: underline;
			}
		}

		.description {
			font-size: 0.9375rem;
			color: var(--color-fg-secondary);
		}
	}

	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.controls {
		display: flex;
		gap: 0.5rem;
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
			background: var(--color-bg-secondary);
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
	}

	.code {
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border-subtle);
		border-radius: 6px;
		padding: 1rem;
		overflow-x: auto;

		pre {
			margin: 0;
			font-size: 0.875rem;
			line-height: 1.6;
			white-space: pre;
		}
	}
</style>

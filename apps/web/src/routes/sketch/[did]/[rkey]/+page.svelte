<script lang="ts">
	import type { PageData } from './$types';
	import BookmarkButton from '@/components/bookmark-button/index.svelte';
	import Button from '@/components/core/button/index.svelte';
	import IconPlay from '@/components/icons/icon-play.svelte';
	import IconStop from '@/components/icons/icon-stop.svelte';
	import { audio, workspace } from '@/lib/globals';

	let { data }: { data: PageData } = $props();

	const isPlaying = $derived(workspace.loaded?.uri === data.sketch.uri && audio.isRunning);

	async function handlePlay() {
		if (isPlaying) {
			audio.stop();
			return;
		}
		const loadedSketch = { uri: data.sketch.uri, title: data.sketch.title, code: data.sketch.code };
		workspace.load(loadedSketch);
		await audio.play(loadedSketch.code);
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

		<BookmarkButton
			subjectUri={data.sketch.uri}
			subjectCid={data.sketch.cid}
			bookmarkUri={data.bookmarkUri}
			size="sm"
		/>
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
				<span class="avatar" data-role="surface-secondary">
					<img src={data.profile.avatar} alt={data.authorPrimaryLabel} />
				</span>
			{/if}
			{data.authorPrimaryLabel}
			{#if data.authorSecondaryLabel}
				<span class="handle">{data.authorSecondaryLabel}</span>
			{/if}
		</a>

		<div class="controls">
			<Button class="play" onclick={handlePlay} variant="secondary">
				{#if isPlaying}
					<IconStop size={12} fill="currentColor" stroke-width={1} />
				{:else}
					<IconPlay size={12} fill="currentColor" stroke-width={1} />
				{/if}
				{isPlaying ? 'Stop' : 'Play'}
			</Button>
			<Button href="/repl?load={encodeURIComponent(data.sketch.uri)}" variant="tertiary">
				Remix
			</Button>
		</div>
	</footer>

	<div class="code" data-role="surface-secondary">
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
			color: var(--color-foreground-tertiary);
		}
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		list-style: none;
		padding: 0;
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
			color: var(--color-foreground-tertiary);

			a {
				color: inherit;
				text-decoration: underline;
			}
		}

		.description {
			font-size: 0.9375rem;
			color: var(--color-foreground-secondary);
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

		:global(.play) {
			min-width: 9.5ch;
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
			background: var(--color-background-primary);
			margin-inline-end: 0.125rem;

			img {
				width: 100%;
				height: 100%;
				object-fit: cover;
				border-radius: 100vmax;
			}
		}

		.handle {
			color: var(--color-foreground-tertiary);
		}
	}

	.code {
		background: var(--color-background-primary);
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

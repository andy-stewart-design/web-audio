<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageData } from './$types';
	import SketchCard from '@/components/sketch-card/index.svelte';

	let { data }: { data: PageData } = $props();

	// Track follow state optimistically — untrack seeds from initial server value
	// without creating a reactive dependency on `data`.
	let followUri = $state(untrack(() => data.followUri));
	const isFollowing = $derived(!!followUri);

	const handleFollow: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success' && result.data?.followUri) {
				followUri = result.data.followUri as string;
			} else {
				await update();
			}
		};
	};

	const handleUnfollow: SubmitFunction = ({ formData }) => {
		formData.set('followUri', followUri!);
		return async ({ result, update }) => {
			if (result.type === 'success') {
				followUri = null;
			} else {
				await update();
			}
		};
	};
</script>

<div class="profile">
	<header class="profile-header">
		<div class="avatar">
			{#if data.profile.avatar}
				<img src={data.profile.avatar} alt={data.profile.handle} />
			{:else}
				<div class="avatar-placeholder"></div>
			{/if}
		</div>

		<div class="identity">
			{#if data.profile.displayName}
				<h1 class="display-name">{data.profile.displayName}</h1>
				<p class="handle">@{data.profile.handle}</p>
			{:else}
				<h1 class="display-name">@{data.profile.handle}</h1>
			{/if}
		</div>

		{#if !data.isOwnProfile && data.session?.did}
			{#if isFollowing}
				<form method="POST" action="?/unfollow" use:enhance={handleUnfollow}>
					<button type="submit" class="follow-btn following">✓ Following</button>
				</form>
			{:else}
				<form method="POST" action="?/follow" use:enhance={handleFollow}>
					<button type="submit" class="follow-btn">+ Follow</button>
				</form>
			{/if}
		{/if}
	</header>

	{#if data.sketches.length === 0}
		<p class="empty">No sketches published yet.</p>
	{:else}
		<ul class="sketches">
			{#each data.sketches as sketch (sketch.uri)}
				<li>
					<SketchCard {sketch} />
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.profile {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 2rem 1rem;
		max-width: 720px;
		margin: auto;
	}

	.profile-header {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.avatar {
		flex-shrink: 0;
		width: 4rem;
		height: 4rem;
		border-radius: 100vmax;
		overflow: hidden;
		background: var(--color-bg-secondary);

		img {
			display: block;
			width: 100%;
			height: 100%;
			object-fit: cover;
		}
	}

	.avatar-placeholder {
		width: 100%;
		height: 100%;
	}

	.identity {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.display-name {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-fg-primary);
	}

	.handle {
		font-size: 0.875rem;
		color: var(--color-fg-tertiary);
	}

	.follow-btn {
		padding: 0.375rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: 100vmax;
		border: none;
		background: var(--color-fg-primary);
		color: var(--color-bg-primary);
		cursor: pointer;

		&.following {
			background: var(--color-fg-tertiary);
		}

		&:hover {
			opacity: 0.85;
		}
	}

	.sketches {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		list-style: none;
		padding: 0;
	}

	.empty {
		color: var(--color-fg-tertiary);
		font-size: 0.875rem;
	}
</style>

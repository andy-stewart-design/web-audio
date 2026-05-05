<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import SketchCard from '@/components/sketch-card/index.svelte';

	let { data }: { data: PageData } = $props();

	// Track follow state optimistically — untrack seeds from initial server value
	// without creating a reactive dependency on `data`.
	let followUri = $state(untrack(() => data.followUri));
	const isFollowing = $derived(!!followUri);
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
				<form
					method="POST"
					action="?/unfollow"
					use:enhance={({ formData }) => {
						formData.set('followUri', followUri!);
						return async ({ result, update }) => {
							if (result.type === 'success') {
								followUri = null;
							} else {
								await update();
							}
						};
					}}
				>
					<button type="submit" class="follow-btn following">following</button>
				</form>
			{:else}
				<form
					method="POST"
					action="?/follow"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success' && result.data?.followUri) {
								followUri = result.data.followUri as string;
							} else {
								await update();
							}
						};
					}}
				>
					<button type="submit" class="follow-btn">follow</button>
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
		max-width: 640px;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
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
		background: #313244;

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
		color: #cdd6f4;
	}

	.handle {
		font-size: 0.875rem;
		color: #585b70;
	}

	.follow-btn {
		padding: 0.375rem 1rem;
		font-family: monospace;
		font-size: 0.875rem;
		border-radius: 100vmax;
		border: 1px solid #89b4fa;
		background: #89b4fa;
		color: #1e1e2e;
		cursor: pointer;

		&.following {
			background: transparent;
			color: #89b4fa;
		}

		&:hover {
			opacity: 0.85;
		}
	}

	.sketches {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		list-style: none;
		padding: 0;
	}

	.empty {
		color: #585b70;
		font-size: 0.9rem;
	}
</style>

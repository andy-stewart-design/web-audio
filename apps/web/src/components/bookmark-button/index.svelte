<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import IconBookmark from '@/components/icons/icon-bookmark.svelte';

	let {
		subjectUri,
		subjectCid,
		bookmarkUri,
		size = 'md'
	}: {
		subjectUri: string;
		subjectCid: string;
		bookmarkUri: string | null;
		size?: 'sm' | 'md';
	} = $props();

	async function handleBookmark() {
		if (bookmarkUri) {
			await fetch('/api/bookmark', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bookmarkUri })
			});
		} else {
			await fetch('/api/bookmark', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ subjectUri, subjectCid })
			});
		}
		await invalidateAll();
	}
</script>

{#if page.data.session.did}
	<button
		class="bookmark"
		class:active={!!bookmarkUri}
		class:sm={size === 'sm'}
		aria-label={bookmarkUri ? 'Remove bookmark' : 'Bookmark'}
		onclick={handleBookmark}
	>
		<IconBookmark
			size={24}
			fill={bookmarkUri ? 'currentColor' : undefined}
			opacity={bookmarkUri ? 1 : 0.5}
		/>
	</button>
{/if}

<style>
	.bookmark {
		display: inline-flex;
		justify-content: center;
		place-items: center;
		block-size: 3rem;
		inline-size: 3rem;
		background: none;
		border: none;
		cursor: pointer;
	}

	.bookmark.sm {
		block-size: 2.5rem;
		inline-size: 2.5rem;
	}
</style>

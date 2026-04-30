<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	const EMOJIS = [
		'👍',
		'👎',
		'💙',
		'🔥',
		'😆',
		'😢',
		'🤔',
		'😴',
		'🎉',
		'🤩',
		'😭',
		'🥳',
		'😤',
		'💀',
		'✨',
		'👀',
		'🙏',
		'📚',
		'💻',
		'🍕',
		'🌴'
	];

	let { currentStatus = null }: { currentStatus?: string | null } = $props();

	let optimistic = $state<string | null>(null);
	let selected = $derived(optimistic ?? currentStatus ?? null);
	let loading = $state(false);

	async function handleSelect(emoji: string) {
		loading = true;
		optimistic = emoji;

		try {
			const res = await fetch('/api/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: emoji })
			});

			if (!res.ok) throw new Error('Failed to update status');

			await invalidateAll();
		} catch (err) {
			console.error('Failed to update status:', err);
			optimistic = null;
		} finally {
			optimistic = null;
			loading = false;
		}
	}
</script>

<div>
	<p class="label">Set your status</p>
	<div class="grid">
		{#each EMOJIS as emoji}
			<button
				onclick={() => handleSelect(emoji)}
				disabled={loading}
				class:selected={selected === emoji}
			>
				{emoji}
			</button>
		{/each}
	</div>
</div>

<style>
	.label {
		font-size: 0.875rem;
		color: #6b7280;
		margin: 0 0 0.75rem;
	}

	.grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	button {
		font-size: 1.5rem;
		padding: 0.5rem;
		border: none;
		border-radius: 0.5rem;
		background: none;
		cursor: pointer;
		transition: background 0.15s;
	}

	button:hover:not(:disabled) {
		background: #f3f4f6;
	}

	button.selected {
		background: #dbeafe;
		outline: 2px solid #3b82f6;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>

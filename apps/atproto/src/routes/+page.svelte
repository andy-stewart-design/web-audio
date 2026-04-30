<script lang="ts">
	import LoginForm from '$lib/components/LoginForm.svelte';
	import LogoutButton from '$lib/components/LogoutButton.svelte';
	import StatusPicker from '$lib/components/StatusPicker.svelte';

	let { data } = $props();

	function timeAgo(dateString: string): string {
		const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
		if (seconds < 60) return 'just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h`;
		return `${Math.floor(hours / 24)}d`;
	}
</script>

<div class="container">
	<main>
		<div class="header">
			<h1>Statusphere</h1>
			<p>Set your status on the Atmosphere</p>
		</div>

		<div class="card">
			{#if data.did}
				<div class="session">
					<p>Signed in as @{data.accountHandle ?? data.did}</p>
					<LogoutButton />
				</div>
				<StatusPicker currentStatus={data.currentStatus} />
			{:else}
				<LoginForm />
			{/if}
		</div>

		{#if data.topStatuses.length > 0}
			<div class="card">
				<h3>Top Statuses</h3>
				<div class="top-statuses">
					{#each data.topStatuses as s, i (i)}
						<span class="badge">
							{s.status}
							<span class="count">{s.count}</span>
						</span>
					{/each}
				</div>
			</div>
		{/if}

		<div class="card">
			<h3>Recent</h3>
			{#if data.recentStatuses.length === 0}
				<p class="empty">No statuses yet. Be the first!</p>
			{:else}
				<ul>
					{#each data.recentStatuses as s, i (i)}
						<li>
							<span class="emoji">{s.status.status}</span>
							<span class="handle">@{s.account.handle}</span>
							<span class="time">{timeAgo(s.status.createdAt)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</main>
</div>

<style>
	.container {
		display: flex;
		min-height: 100vh;
		justify-content: center;
		background: #fafafa;
		padding: 2rem 1rem;
	}

	main {
		width: 100%;
		max-width: 28rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.header {
		text-align: center;
		margin-bottom: 1rem;
	}

	h1 {
		font-size: 1.875rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
	}

	.header p {
		color: #6b7280;
		margin: 0;
	}

	.card {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		padding: 1.5rem;
	}

	.session {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.session p {
		font-size: 0.875rem;
		color: #6b7280;
		margin: 0;
	}

	h3 {
		font-size: 0.875rem;
		font-weight: 500;
		color: #6b7280;
		margin: 0 0 0.75rem;
	}

	.top-statuses {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.75rem;
		background: #f3f4f6;
		border-radius: 9999px;
		font-size: 0.875rem;
	}

	.count {
		color: #6b7280;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.emoji {
		font-size: 1.5rem;
	}

	.handle {
		font-size: 0.875rem;
		color: #4b5563;
	}

	.time {
		font-size: 0.75rem;
		color: #9ca3af;
		margin-left: auto;
	}

	.empty {
		font-size: 0.875rem;
		color: #6b7280;
		margin: 0;
	}
</style>

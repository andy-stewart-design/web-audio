<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	async function handleLogout() {
		await fetch('/oauth/logout', { method: 'POST' });
		await invalidateAll();
	}
</script>

<button onclick={handleLogout}>Sign out</button>

<style>
	button {
		font-size: 0.875rem;
		color: #6b7280;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}

	button:hover {
		color: #374151;
	}
</style>

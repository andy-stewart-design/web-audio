<script lang="ts">
	import LoginForm from '$lib/components/LoginForm.svelte';
	import LogoutButton from '$lib/components/LogoutButton.svelte';
	import StatusPicker from '$lib/components/StatusPicker.svelte';

	let { data } = $props();
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
					<p>Signed in ({data.did})</p>
					<LogoutButton />
				</div>
				<StatusPicker currentStatus={data.currentStatus} />
			{:else}
				<LoginForm />
			{/if}
		</div>
	</main>
</div>

<style>
	.container {
		display: flex;
		min-height: 100vh;
		align-items: center;
		justify-content: center;
		background: #fafafa;
	}

	main {
		width: 100%;
		max-width: 28rem;
		padding: 2rem;
	}

	.header {
		text-align: center;
		margin-bottom: 2rem;
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
</style>

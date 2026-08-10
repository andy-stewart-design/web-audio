<script lang="ts">
	import Popover from './index.svelte';

	let firstOpen = $state(false);
	let secondOpen = $state(false);
</script>

<Popover id="first-panel" ariaLabel="First popover" bind:open={firstOpen}>
	{#snippet trigger({ trigger, props })}
		<button use:trigger {...props} data-testid="first-trigger">First</button>
	{/snippet}
	{#snippet content({ popover, props })}
		<div use:popover {...props} data-testid="first-panel">First panel</div>
	{/snippet}
</Popover>

<Popover id="second-panel" ariaLabel="Second popover" bind:open={secondOpen}>
	{#snippet trigger({ trigger, props })}
		<button use:trigger {...props} data-testid="second-trigger">Second</button>
	{/snippet}
	{#snippet content({ popover, props })}
		<div use:popover {...props} data-testid="second-panel">Second panel</div>
	{/snippet}
</Popover>

<output data-testid="first-state">{firstOpen}</output>
<output data-testid="second-state">{secondOpen}</output>

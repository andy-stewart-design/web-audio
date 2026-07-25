<script lang="ts">
	import Popover from './index.svelte';

	interface Props {
		id?: string;
		role?: 'dialog' | 'menu' | 'listbox' | 'tree' | 'grid';
		open?: boolean;
	}

	let { id, role, open = $bindable(false) }: Props = $props();
</script>

<Popover ariaLabel="Test popover" {id} {role} bind:open>
	{#snippet trigger({ trigger, props })}
		<button use:trigger {...props} data-testid="trigger">Open</button>
	{/snippet}

	{#snippet content({ popover, props, close, initialFocus })}
		<section use:popover {...props} data-testid="panel">
			<button use:initialFocus>Initial focus</button>
			<button onclick={() => close()}>Close</button>
		</section>
	{/snippet}
</Popover>

<output data-testid="open-state">{open}</output>
<button data-testid="open-externally" onclick={() => (open = true)}>Open externally</button>
<button data-testid="close-externally" onclick={() => (open = false)}>Close externally</button>
<button data-testid="outside">Outside</button>

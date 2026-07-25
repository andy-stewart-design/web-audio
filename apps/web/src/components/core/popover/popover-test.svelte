<script lang="ts">
	import type { Placement } from '@floating-ui/dom';
	import Popover from './index.svelte';

	interface Props {
		id?: string;
		role?: 'dialog' | 'menu' | 'listbox' | 'tree' | 'grid';
		placement?: Placement;
		offset?: number;
		collisionPadding?: number;
		edge?: boolean;
		open?: boolean;
	}

	let {
		id,
		role,
		placement,
		offset,
		collisionPadding,
		edge = false,
		open = $bindable(false)
	}: Props = $props();
</script>

<Popover ariaLabel="Test popover" {id} {role} {placement} {offset} {collisionPadding} bind:open>
	{#snippet trigger({ trigger, props })}
		<button
			use:trigger
			{...props}
			data-testid="trigger"
			style:position={edge ? 'fixed' : undefined}
			style:right={edge ? '0' : undefined}
			style:bottom={edge ? '0' : undefined}
			style:margin-left={edge ? undefined : '200px'}
			style:margin-top={edge ? undefined : '150px'}>Open</button
		>
	{/snippet}

	{#snippet content({ popover, props, close, initialFocus })}
		<section
			use:popover
			{...props}
			data-testid="panel"
			style={`${props.style} width: 8rem; height: 6rem;`}
		>
			<button use:initialFocus>Initial focus</button>
			<button onclick={() => close()}>Close</button>
		</section>
	{/snippet}
</Popover>

<output data-testid="open-state">{open}</output>
<button
	data-testid="open-externally"
	onclick={() => (open = true)}
	style="position: fixed; left: 0; bottom: 4rem;">Open externally</button
>
<button
	data-testid="close-externally"
	onclick={() => (open = false)}
	style="position: fixed; left: 0; bottom: 2rem;">Close externally</button
>
<button data-testid="outside" style="position: fixed; left: 0; bottom: 0;">Outside</button>

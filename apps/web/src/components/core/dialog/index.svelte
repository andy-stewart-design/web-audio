<script lang="ts">
	import IconClose from '../../icons/icon-close.svelte';
	import type { Snippet } from 'svelte';

	let { title, content }: { title: string; content: Snippet } = $props();

	const uid = $props.id();
	const titleId = `dialog-title-${uid}`;
	let dialogElement = $state<HTMLDialogElement>();

	export function open() {
		dialogElement?.showModal();
	}

	export function close() {
		dialogElement?.close();
	}
</script>

<dialog
	bind:this={dialogElement}
	aria-labelledby={titleId}
	onclick={(event) => {
		if (event.target === event.currentTarget) close();
	}}
>
	<div class="surface" data-role="surface-secondary">
		<header>
			<h2 id={titleId}>{title}</h2>
			<button type="button" class="close" aria-label="Close" onclick={close}>
				<IconClose size={16} />
			</button>
		</header>
		{@render content()}
	</div>
</dialog>

<style>
	dialog {
		width: min(480px, 90vw);
		max-width: none;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--color-foreground-primary);

		&::backdrop {
			background: rgb(0 0 0 / 0.5);
			backdrop-filter: blur(2px);
		}
	}

	.surface {
		padding: 1.5rem;
		background: var(--color-background-primary);
		border: 1px solid var(--color-border-subtle);
		border-radius: 8px;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-block-end: 1.5rem;

		h2 {
			font-size: 1.25rem;
		}
	}

	.close {
		display: flex;
		align-items: center;
		justify-content: center;
		block-size: 2rem;
		inline-size: 2rem;
		padding: 0;
		background: none;
		border: none;
		border-radius: 100vmax;
	}
</style>

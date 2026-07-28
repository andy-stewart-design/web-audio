<script lang="ts">
	import type { HTMLInputAttributes, HTMLTextareaAttributes } from 'svelte/elements';

	type Props = {
		label: string;
		hint?: string;
		multiline?: boolean;
		value?: string;
	} & Omit<HTMLInputAttributes, 'value'> &
		Omit<HTMLTextareaAttributes, 'value'>;

	const uid = $props.id();
	const generatedId = `text-input-${uid}`;
	let {
		label,
		hint,
		multiline = false,
		value = $bindable(''),
		id = generatedId,
		spellcheck = false,
		...props
	}: Props = $props();
</script>

<label for={id}>
	<span class="label-row">
		<span>{label}</span>
		{#if hint}<span class="hint">{hint}</span>{/if}
	</span>
	{#if multiline}
		<textarea {...props} {id} bind:value {spellcheck}></textarea>
	{:else}
		<input {...props} {id} bind:value {spellcheck} />
	{/if}
</label>

<style>
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.875rem;
	}

	.label-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.hint {
		font-size: 0.75rem;
		color: var(--color-fg-tertiary);
	}

	input,
	textarea {
		padding: 0.375rem 0.5rem;
		background: var(--color-bg-primary);
		color: var(--color-fg-primary);
		border: 1px solid var(--color-border-subtle);
		border-radius: 4px;
		font-family: monospace;
		font-size: 0.875rem;

		&:focus {
			outline: none;
		}

		&:focus-visible {
			outline: 1px solid var(--color-fg-primary);
		}
	}

	textarea {
		resize: vertical;
		field-sizing: content;
		min-height: 3lh;
	}
</style>

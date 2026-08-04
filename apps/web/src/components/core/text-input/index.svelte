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
		gap: 0.375rem;
		font-size: 0.875rem;
	}

	.label-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		color: var(--color-foreground-secondary);
	}

	.hint {
		font-size: 0.75rem;
		color: var(--color-foreground-tertiary);
	}

	input,
	textarea {
		padding: 0.5rem 0.625rem;
		background: var(--color-background-primary);
		color: var(--color-foreground-primary);
		border: 1px solid var(--color-border-subtle);
		border-radius: 4px;
		font-family: monospace;
		font-size: 0.875rem;
		min-height: 2.5rem;

		&:focus {
			outline: none;
		}

		&:focus-visible {
			outline: 1px solid var(--color-foreground-primary);
		}
	}

	textarea {
		resize: none;
		field-sizing: content;
		min-height: 5.125rem;
	}
</style>

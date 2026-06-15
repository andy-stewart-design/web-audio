<script lang="ts">
	import { onMount } from 'svelte';
	import { createCodeMirror } from '@web-audio/editor';

	let {
		value = $bindable(''),
		onRun
	}: {
		value: string;
		onRun?: (value: string) => void;
	} = $props();

	let host = $state<HTMLElement>();
	let view: ReturnType<typeof createCodeMirror> | undefined;

	onMount(() => {
		if (!host) return;

		view = createCodeMirror({
			parent: host,
			doc: value,
			onChange: (nextValue) => {
				value = nextValue;
			},
			onRun
		});

		return () => {
			view?.destroy();
			view = undefined;
		};
	});
</script>

<div bind:this={host} class="editor"></div>

<style>
	.editor {
		min-height: 0;
	}
</style>

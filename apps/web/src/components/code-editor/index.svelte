<script lang="ts">
	import { onMount } from 'svelte';
	import { createCodeMirror } from '@web-audio/editor';

	let {
		value = $bindable(''),
		onRun,
		onStop
	}: {
		value: string;
		onRun?: (value: string) => void;
		onStop?: () => void;
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
			onRun,
			onStop
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
		--cm-editor-block-size: 100%;

		height: 100%;
	}
</style>

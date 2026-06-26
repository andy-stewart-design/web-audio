<script lang="ts">
	import Visualizer from '@web-audio/visualizer';
	import { onDestroy } from 'svelte';
	import { audio } from '$lib/globals';

	let canvas: HTMLCanvasElement | undefined = $state();
	let visualizer: Visualizer | null = null;

	function ensureVisualizer() {
		if (visualizer || !canvas) return;

		const analyser = audio.getAnalyser();
		if (!analyser) return;

		visualizer = new Visualizer({
			analyser,
			canvas,
			type: 'curve'
		});
	}

	$effect(() => {
		const isRunning = audio.isRunning;
		ensureVisualizer();

		if (isRunning) visualizer?.start();
		else visualizer?.stop();
	});

	onDestroy(() => {
		visualizer?.destroy();
		visualizer = null;
	});
</script>

<section class="visualizer" aria-label="Audio visualizer">
	<canvas bind:this={canvas}></canvas>
</section>

<style>
	.visualizer {
		/*padding: 0.75rem 1rem;*/
		border-bottom: 1px solid var(--color-border-subtle);
		background: var(--color-bg-secondary);
	}

	canvas {
		display: block;
		inline-size: 100%;
		block-size: 10rem;
		/*border: 1px solid var(--color-border-subtle);*/
		border-radius: 6px;
		background: #08090d;
	}
</style>

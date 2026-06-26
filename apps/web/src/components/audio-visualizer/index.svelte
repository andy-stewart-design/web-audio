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
			type: 'curve',
			colors: {
				foreground: [0.92, 0.006, 274],
				background: [0.12, 0.005, 285]
			}
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
		border-bottom: 1px solid var(--color-border-subtle);
		background: var(--color-bg-primary);
	}

	canvas {
		display: block;
		inline-size: 100%;
		aspect-ratio: 3 / 2;
		border-radius: 6px;
		background: var(--color-bg-primary);
	}
</style>

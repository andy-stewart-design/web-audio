import type { LoadedSketch } from './audio.svelte';

type ReplControls = {
	canPublish: () => boolean;
	getSketch: () => LoadedSketch;
	publish: () => void;
};

class ReplControlRegistry {
	controls = $state<ReplControls | null>(null);

	register(controls: ReplControls) {
		this.controls = controls;
		return () => {
			if (this.controls === controls) this.controls = null;
		};
	}
}

export const replControls = new ReplControlRegistry();

import { audio } from './audio.svelte';

type ControlOverrides = {
	play?: () => Promise<void> | void;
	stop?: () => void;
	publish?: () => void;
	canPlay?: () => boolean;
	canPublish?: () => boolean;
};

class GlobalControls {
	private overrides = $state<ControlOverrides | null>(null);

	register(overrides: ControlOverrides) {
		this.overrides = overrides;
		return () => {
			if (this.overrides === overrides) this.overrides = null;
		};
	}

	get isRunning() {
		return audio.isRunning;
	}

	get title() {
		return audio.loadedSketch?.title ?? '';
	}

	get canPlay() {
		return this.overrides?.canPlay?.() ?? Boolean(audio.loadedSketch);
	}

	get canStop() {
		return audio.isRunning;
	}

	get canPublish() {
		return this.overrides?.canPublish?.() ?? false;
	}

	get showPublish() {
		return Boolean(this.overrides?.publish);
	}

	async play() {
		if (this.overrides?.play) {
			await this.overrides.play();
			return;
		}

		await audio.play();
	}

	stop() {
		if (this.overrides?.stop) {
			this.overrides.stop();
			return;
		}

		audio.stop();
	}

	publish() {
		this.overrides?.publish?.();
	}
}

export const globalControls = new GlobalControls();

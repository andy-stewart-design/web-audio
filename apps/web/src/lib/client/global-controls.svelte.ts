import { audio } from './audio.svelte';

export type AudioPlayer = typeof audio;

type ControlOverrides = {
	play?: (player: AudioPlayer) => Promise<void> | void;
	stop?: (player: AudioPlayer) => void;
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

	get player() {
		return audio;
	}

	withPlayer<T>(callback: (player: AudioPlayer) => T) {
		return callback(audio);
	}

	async play() {
		if (this.overrides?.play) {
			await this.overrides.play(audio);
			return;
		}

		await audio.play();
	}

	stop() {
		if (this.overrides?.stop) {
			this.overrides.stop(audio);
			return;
		}

		audio.stop();
	}

	publish() {
		this.overrides?.publish?.();
	}
}

export const globalControls = new GlobalControls();

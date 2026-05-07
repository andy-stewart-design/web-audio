import AudioClock from '@web-audio/clock';
import { createAudioContext, type ManagedAudioContext } from '@web-audio/context';
import Drome from '@web-audio/fluid';
import AudioEngine from '@web-audio/audio-engine';

class AudioPlayer {
	isRunning = $state(false);
	currentUri = $state<string | null>(null);
	lastError = $state<string | null>(null);

	private audioCtx: ManagedAudioContext | null = null;
	private clock: AudioClock | null = null;
	private engine: AudioEngine | null = null;

	private getAudio(): ManagedAudioContext {
		if (!this.audioCtx || this.audioCtx.ctx.state === 'closed') {
			this.audioCtx = createAudioContext({ allowBackgroundPlayback: true });
		}
		return this.audioCtx;
	}

	private getClock(): AudioClock {
		if (!this.clock) this.clock = new AudioClock(this.getAudio().ctx, 140, 4);
		return this.clock;
	}

	private getEngine(): AudioEngine {
		if (!this.engine) this.engine = new AudioEngine(this.getAudio().ctx, this.getClock());
		return this.engine;
	}

	async play(code: string, uri?: string): Promise<void> {
		this.lastError = null;
		try {
			const d = new Drome();
			new Function('drome', 'd', code)(d, d);
			const schema = d.getSchema();
			this.getEngine().update(schema);
			if (!this.isRunning) {
				await this.getClock().start();
				this.isRunning = true;
			}
			this.currentUri = uri ?? null;
		} catch (err) {
			this.lastError = (err as Error).message;
			throw err;
		}
	}

	stop(): void {
		this.clock?.stop();
		this.isRunning = false;
		this.currentUri = null;
	}
}

export const audio = new AudioPlayer();

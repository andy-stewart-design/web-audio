import AudioClock from '@web-audio/clock';
import { createAudioContext, type ManagedAudioContext } from '@web-audio/context';
import AudioEngine from '@web-audio/audio-engine';
import type { DromeSchema } from '@web-audio/schema';

type PendingEval = { resolve: (schema: DromeSchema) => void; reject: (err: Error) => void };

export type LogEntry = {
	id: string;
	type: 'output' | 'error';
	message: string;
};

class AudioPlayer {
	isRunning = $state(false);
	lastError = $state<string | null>(null);

	private audioCtx: ManagedAudioContext | null = null;
	private clock: AudioClock | null = null;
	private engine: AudioEngine | null = null;
	private worker: Worker | null = null;
	private pending = new Map<string, PendingEval>();

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

	private getWorker(): Worker {
		if (!this.worker) {
			this.worker = new Worker(new URL('./eval.worker.ts', import.meta.url), { type: 'module' });
			this.worker.onmessage = (
				e: MessageEvent<{ id: string; schema?: DromeSchema; error?: string }>
			) => {
				const { id, schema, error } = e.data;
				const p = this.pending.get(id);
				if (!p) return;
				this.pending.delete(id);
				if (error) p.reject(new Error(error));
				else p.resolve(schema!);
			};
		}
		return this.worker;
	}

	private evalCode(code: string): Promise<DromeSchema> {
		return new Promise((resolve, reject) => {
			const id = crypto.randomUUID();
			this.pending.set(id, { resolve, reject });
			this.getWorker().postMessage({ id, code });
		});
	}

	async play(code: string): Promise<LogEntry> {
		this.lastError = null;
		try {
			const schema = await this.evalCode(code);
			const engine = this.getEngine();
			await engine.ready;
			engine.update(schema);
			await engine.prepare();
			if (!this.isRunning) {
				await this.getClock().start();
				this.isRunning = true;
			}
			return {
				id: crypto.randomUUID(),
				type: 'output',
				message: 'Code evaluated'
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown playback error';
			this.lastError = message;
			return {
				id: crypto.randomUUID(),
				type: 'error',
				message
			};
		}
	}

	stop(): void {
		this.clock?.stop();
		this.isRunning = false;
	}
}

export const audioPlayer = new AudioPlayer();

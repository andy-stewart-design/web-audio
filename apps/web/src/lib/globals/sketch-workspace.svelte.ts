import type { LogEntry } from './audio-player.svelte';
import type { DraftSketch, DraftSketchSource, PlayableSketch } from '$lib/types/sketch';

const DEFAULT_CODE = `d.synth("triangle").push()`;

class SketchWorkspace {
	loaded = $state<PlayableSketch | null>(null);
	draft = $state<DraftSketch | null>(null);
	logs = $state<LogEntry[]>([]);

	load(sketch: PlayableSketch) {
		this.loaded = sketch;
	}

	clearLoaded() {
		this.loaded = null;
	}

	openDraft(sketch?: DraftSketchSource) {
		if (!sketch) {
			this.draft = {
				uri: null,
				title: '',
				code: DEFAULT_CODE,
				description: '',
				tags: '',
				rootVersion: null,
				previousVersion: null
			};
			this.loaded = null;
			this.clearLogs();
			return;
		}

		this.draft = {
			uri: sketch.uri,
			title: sketch.title,
			code: sketch.code,
			description: sketch.description ?? '',
			tags: sketch.tags?.join(', ') ?? '',
			rootVersion: sketch.rootVersion ?? sketch.uri ?? null,
			previousVersion: sketch.uri ?? null
		};
		this.loaded = {
			uri: sketch.uri,
			title: sketch.title,
			code: sketch.code
		};
		this.clearLogs();
	}

	commitDraft() {
		if (!this.draft) return null;
		this.loaded = {
			uri: this.draft.uri,
			title: this.draft.title.trim(),
			code: this.draft.code
		};
		return this.loaded;
	}

	clearDraft() {
		this.draft = null;
	}

	addLog(entry: LogEntry) {
		this.logs = [entry, ...this.logs];
	}

	clearLogs() {
		this.logs = [];
	}
}

export const workspace = new SketchWorkspace();

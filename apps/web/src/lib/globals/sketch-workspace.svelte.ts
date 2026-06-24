import type { LogEntry } from './audio-player.svelte';

const DEFAULT_CODE = `d.synth("triangle").push()`;

export type LoadedSketch = {
	uri: string | null;
	title: string;
	code: string;
};

export type DraftSketch = {
	uri: string | null;
	title: string;
	code: string;
	description: string;
	tags: string;
	rootVersion: string | null;
	previousVersion: string | null;
};

type DraftSource = LoadedSketch & {
	description?: string | null;
	tags?: string[] | null;
	rootVersion?: string | null;
	previousVersion?: string | null;
};

class SketchWorkspace {
	loaded = $state<LoadedSketch | null>(null);
	draft = $state<DraftSketch | null>(null);
	logs = $state<LogEntry[]>([]);

	load(sketch: LoadedSketch) {
		this.loaded = sketch;
	}

	clearLoaded() {
		this.loaded = null;
	}

	openDraft(sketch?: DraftSource) {
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

export const sketchWorkspace = new SketchWorkspace();

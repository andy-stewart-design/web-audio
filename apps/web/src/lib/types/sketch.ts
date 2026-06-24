export type Sketch = {
	uri: string;
	cid: string;
	authorDid: string;
	title: string;
	code: string;
	description: string | null;
	tags: string[] | null;
	previousVersion: string | null;
	rootVersion: string | null;
	createdAt: string;
};

export type SketchCard = Sketch & {
	authorHandle: string;
	authorDisplayName: string | null;
	authorAvatar: string | null;
	bookmarkUri: string | null;
};

export type PlayableSketch = {
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

export type DraftSketchSource = PlayableSketch & {
	description: string | null;
	tags: string[] | null;
	rootVersion: string | null;
	previousVersion: string | null;
};

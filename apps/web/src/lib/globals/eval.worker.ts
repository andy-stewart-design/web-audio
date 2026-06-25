import Drome from '@web-audio/fluid';
import type { DromeSchema } from '@web-audio/schema';

interface EvalRequest {
	id: string;
	code: string;
}

interface EvalResponse {
	id: string;
	schema?: DromeSchema;
	error?: string;
}

self.onmessage = (e: MessageEvent<EvalRequest>) => {
	const { id, code } = e.data;
	try {
		const d = new Drome();
		new Function('drome', 'd', code)(d, d);
		const schema = d.getSchema();
		self.postMessage({ id, schema } satisfies EvalResponse);
	} catch (err) {
		self.postMessage({ id, error: (err as Error).message } satisfies EvalResponse);
	}
};

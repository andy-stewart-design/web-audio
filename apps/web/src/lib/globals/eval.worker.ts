import { evaluateSource } from '@web-audio/fluid';
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
		const schema = evaluateSource(code);
		self.postMessage({ id, schema } satisfies EvalResponse);
	} catch (err) {
		self.postMessage({ id, error: (err as Error).message } satisfies EvalResponse);
	}
};

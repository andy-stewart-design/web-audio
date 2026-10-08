import type { DromeSchema } from '@web-audio/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Import the actual worker module with only its host messaging API replaced.
// Fluid compilation remains real; do not duplicate the evaluator in this test.
const postMessage =
	vi.fn<(message: { id: string; schema?: DromeSchema; error?: string }) => void>();
const scope: {
	onmessage: ((event: MessageEvent<{ id: string; code: string }>) => void) | null;
	postMessage: typeof postMessage;
} = { onmessage: null, postMessage };

function send(id: string, code: string) {
	if (!scope.onmessage) throw new Error('Worker handler not installed');
	scope.onmessage(new MessageEvent('message', { data: { id, code } }));
	return postMessage.mock.calls.at(-1)?.[0];
}

beforeEach(async () => {
	vi.resetModules();
	postMessage.mockClear();
	scope.onmessage = null;
	vi.stubGlobal('self', scope);
	await import('../eval.worker');
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('REPL worker evaluation contract', () => {
	it('exposes both aliases as the same fresh Drome and preserves the request ID', () => {
		const response = send(
			'aliases',
			`if (d !== drome) throw new Error('different aliases');
			 d.bpm(90); drome.synth('sine').notes(69).push();`
		);
		expect(postMessage).toHaveBeenCalledOnce();
		expect(response).toMatchObject({
			id: 'aliases',
			schema: { bpm: 90, instruments: [{ type: 'synthesizer', waveform: 'sine' }] }
		});
		expect(response).not.toHaveProperty('error');
	});

	it('isolates instruments, banks, buses, and BPM between requests in the same worker', () => {
		send(
			'populated',
			`d.bpm(95); d.loadSamples({kick: ['kick.wav']});
			 d.bus('drums'); d.sample('kick').bank('user').route('drums').push();`
		);
		expect(send('empty', '')).toEqual({
			id: 'empty',
			schema: { bpm: undefined, instruments: [], banks: {}, buses: {} }
		});
	});

	it('gets the schema from Drome rather than using the source return value', () => {
		expect(send('return', 'd.synth().push(); return {ignored: true};')).toMatchObject({
			id: 'return',
			schema: { instruments: [{ type: 'synthesizer' }] }
		});
	});

	it.each([
		['syntax', 'const = ;', /Unexpected token/],
		['runtime', "throw new Error('sketch failed');", /^sketch failed$/],
		['schema', "d.synth().route('missing').push();", /does not reference a declared bus/],
		['top-level await', 'await Promise.resolve();', /await/]
	])('serializes %s errors without poisoning a later request', (id, code, message) => {
		const response = send(id, code);
		expect(response?.id).toBe(id);
		expect(response?.error).toMatch(message);
		expect(response).not.toHaveProperty('schema');
		expect(send('recovered', 'd.synth().push();')).toMatchObject({
			id: 'recovered',
			schema: { instruments: [{ type: 'synthesizer' }] }
		});
	});

	it('posts the schema synchronously without waiting for returned promises', async () => {
		const response = send('synchronous', 'return Promise.resolve().then(() => d.synth().push());');
		expect(postMessage).toHaveBeenCalledOnce();
		expect(response?.schema?.instruments).toEqual([]);
		await Promise.resolve();
		expect(response?.schema?.instruments).toEqual([]);
		expect(postMessage).toHaveBeenCalledOnce();
	});
});

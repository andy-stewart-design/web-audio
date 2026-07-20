import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	connectMidi: vi.fn(),
	disconnectMidi: vi.fn(),
	midiRecords: [] as Array<{
		instance: unknown;
		destroy: ReturnType<typeof vi.fn>;
		rejectReady: (error: unknown) => void;
	}>
}));

vi.mock('@web-audio/context', () => ({
	createAudioContext: () => ({
		ctx: {
			state: 'running',
			createGain: vi.fn(),
			createAnalyser: vi.fn()
		}
	})
}));

vi.mock('@web-audio/clock', () => ({
	default: class MockAudioClock {}
}));

vi.mock('@web-audio/audio-engine', () => ({
	default: class MockAudioEngine {
		ready = Promise.resolve();
		connectMidi = mocks.connectMidi;
		disconnectMidi = mocks.disconnectMidi;
		getAnalyser() {
			return null;
		}
	}
}));

vi.mock('@web-audio/midi', () => ({
	Midi: class MockMidi {
		ready: Promise<void>;
		destroy = vi.fn();

		constructor() {
			let rejectReady: (error: unknown) => void = () => {};
			this.ready = new Promise((_resolve, reject) => {
				rejectReady = reject;
			});
			mocks.midiRecords.push({
				instance: this,
				destroy: this.destroy,
				rejectReady
			});
		}
	}
}));

import { audio } from './audio-player.svelte';

beforeEach(() => {
	audio.disableMidi();
	mocks.connectMidi.mockClear();
	mocks.disconnectMidi.mockClear();
	mocks.midiRecords.length = 0;
	audio.lastError = null;
});

describe('AudioPlayer MIDI ownership', () => {
	test('creates, retains, and connects one MIDI instance', () => {
		const first = audio.enableMidi();
		const second = audio.enableMidi();

		expect(second).toBe(first);
		expect(mocks.midiRecords).toHaveLength(1);
		expect(mocks.connectMidi).toHaveBeenCalledOnce();
		expect(mocks.connectMidi).toHaveBeenCalledWith(first);
	});

	test('disconnects and destroys MIDI before allowing a new instance', () => {
		const first = audio.enableMidi();
		const firstRecord = mocks.midiRecords[0];

		audio.disableMidi();
		const second = audio.enableMidi();

		expect(mocks.disconnectMidi).toHaveBeenCalledOnce();
		expect(firstRecord.destroy).toHaveBeenCalledOnce();
		expect(second).not.toBe(first);
		expect(mocks.midiRecords).toHaveLength(2);
	});

	test('handles ready rejection without leaving an unhandled promise', async () => {
		audio.enableMidi();
		mocks.midiRecords[0].rejectReady(new Error('permission denied'));

		await Promise.resolve();

		expect(audio.lastError).toBe('permission denied');
	});
});

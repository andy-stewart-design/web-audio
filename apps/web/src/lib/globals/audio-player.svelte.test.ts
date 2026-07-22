import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	connectMidi: vi.fn(),
	disconnectMidi: vi.fn(),
	midiRecords: [] as Array<{
		instance: unknown;
		destroy: ReturnType<typeof vi.fn>;
		rejectReady: (error: unknown) => void;
		status: { set: (value: string) => void };
		inputs: { set: (value: unknown[]) => void };
		outputs: { set: (value: unknown[]) => void };
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

vi.mock('@web-audio/midi', () => {
	class MockSignal<T> {
		private listeners = new Set<(value: T) => void>();

		constructor(private value: T) {}

		subscribe(listener: (value: T) => void) {
			this.listeners.add(listener);
			listener(this.value);
			return () => this.listeners.delete(listener);
		}

		set(value: T) {
			this.value = value;
			this.listeners.forEach((listener) => listener(value));
		}
	}

	return {
		Midi: class MockMidi {
			ready: Promise<void>;
			destroy = vi.fn();
			status = new MockSignal('pending');
			inputs = new MockSignal<unknown[]>([]);
			outputs = new MockSignal<unknown[]>([]);

			constructor() {
				let rejectReady: (error: unknown) => void = () => {};
				this.ready = new Promise((_resolve, reject) => {
					rejectReady = reject;
				});
				mocks.midiRecords.push({
					instance: this,
					destroy: this.destroy,
					rejectReady,
					status: this.status,
					inputs: this.inputs,
					outputs: this.outputs
				});
			}
		}
	};
});

import { audio } from './audio-player.svelte';

afterEach(() => {
	vi.useRealTimers();
});

beforeEach(() => {
	audio.disableMidi();
	mocks.connectMidi.mockClear();
	mocks.disconnectMidi.mockClear();
	mocks.midiRecords.length = 0;
	audio.lastError = null;
	audio.midiError = null;
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

	test('toggles the owned MIDI instance', () => {
		audio.toggleMidi();
		expect(mocks.connectMidi).toHaveBeenCalledOnce();

		audio.toggleMidi();
		expect(mocks.disconnectMidi).toHaveBeenCalledOnce();
		expect(mocks.midiRecords[0].destroy).toHaveBeenCalledOnce();
	});

	test('hides brief pending status transitions from display state', () => {
		vi.useFakeTimers();
		audio.enableMidi();
		const record = mocks.midiRecords[0];

		expect(audio.midiStatus).toBe('pending');
		expect(audio.midiDisplayStatus).toBe('disabled');
		record.status.set('connected');
		vi.advanceTimersByTime(100);

		expect(audio.midiDisplayStatus).toBe('connected');
	});

	test('displays connecting when pending lasts beyond the anti-flicker delay', () => {
		vi.useFakeTimers();
		audio.enableMidi();

		vi.advanceTimersByTime(99);
		expect(audio.midiDisplayStatus).toBe('disabled');
		vi.advanceTimersByTime(1);
		expect(audio.midiDisplayStatus).toBe('pending');
	});

	test('copies reactive MIDI status and port snapshots into app state', () => {
		audio.enableMidi();
		const record = mocks.midiRecords[0];
		const input = { id: 'input-id', name: 'Controller' };
		const output = { id: 'output-id', name: 'Synth' };

		record.status.set('connected');
		record.inputs.set([input]);
		record.outputs.set([output]);

		expect(audio.midiStatus).toBe('connected');
		expect(audio.midiInputs).toEqual([input]);
		expect(audio.midiOutputs).toEqual([output]);
	});

	test('stops mirroring signals and clears snapshots when disabled', () => {
		audio.enableMidi();
		const record = mocks.midiRecords[0];
		record.inputs.set([{ id: 'input-id', name: 'Controller' }]);

		audio.disableMidi();
		record.status.set('connected');
		record.inputs.set([{ id: 'late-input', name: 'Late controller' }]);

		expect(audio.midiStatus).toBe('disabled');
		expect(audio.midiDisplayStatus).toBe('disabled');
		expect(audio.midiInputs).toEqual([]);
		expect(audio.midiOutputs).toEqual([]);
	});

	test('disconnects and destroys MIDI before allowing a new instance', () => {
		const first = audio.enableMidi();
		const firstRecord = mocks.midiRecords[0];

		audio.disableMidi();
		const second = audio.enableMidi();

		expect(mocks.disconnectMidi).toHaveBeenCalledOnce();
		expect(firstRecord.destroy).toHaveBeenCalledOnce();
		expect(audio.midiStatus).toBe('pending');
		expect(audio.midiInputs).toEqual([]);
		expect(audio.midiOutputs).toEqual([]);
		expect(second).not.toBe(first);
		expect(mocks.midiRecords).toHaveLength(2);
	});

	test('handles ready rejection without leaving an unhandled promise', async () => {
		audio.enableMidi();
		mocks.midiRecords[0].rejectReady(new Error('permission denied'));

		await Promise.resolve();

		expect(audio.midiError).toBe('permission denied');
		expect(audio.lastError).toBe('permission denied');
	});
});

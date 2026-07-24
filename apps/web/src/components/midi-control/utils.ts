import type { MidiDevice, MidiStatus } from '@web-audio/midi';
import type { Device } from './types';

function groupDevices(inputs: MidiDevice[], outputs: MidiDevice[]) {
	const grouped: Device[] = [];

	const add = (device: { id: string; name: string | null }, direction: 'input' | 'output') => {
		const key = device.name === null ? `id:${device.id}` : `name:${device.name}`;
		let group = grouped.find((candidate) => candidate.key === key);
		if (!group) {
			group = { key, name: device.name, ports: [] };
			grouped.push(group);
		}
		let port = group.ports.find(({ id }) => id === device.id);
		if (!port) {
			port = { id: device.id, input: false, output: false };
			group.ports.push(port);
		}
		port[direction] = true;
	};

	inputs.forEach((device) => add(device, 'input'));
	outputs.forEach((device) => add(device, 'output'));
	return grouped;
}

function getMidiStatus(status: MidiStatus | 'disabled') {
	switch (status) {
		case 'disabled':
			return 'MIDI disabled';
		case 'pending':
			return 'MIDI connecting…';
		case 'connected':
			return 'MIDI connected';
		case 'denied':
			return 'MIDI permission denied';
		case 'unavailable':
			return 'MIDI unavailable';
		case 'error':
			return 'MIDI error';
		case 'destroyed':
			return 'MIDI destroyed';
	}
}

export { getMidiStatus, groupDevices };

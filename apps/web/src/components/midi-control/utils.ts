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

const BASE_STATUS = 'MIDI Link';

function getMidiStatus(status: MidiStatus | 'disabled') {
	switch (status) {
		case 'disabled':
			return `${BASE_STATUS} disabled`;
		case 'pending':
			return `${BASE_STATUS} connecting…`;
		case 'connected':
			return `${BASE_STATUS} connected`;
		case 'denied':
			return `${BASE_STATUS} permission denied`;
		case 'unavailable':
			return `${BASE_STATUS} unavailable`;
		case 'error':
			return `${BASE_STATUS} error`;
		case 'destroyed':
			return `${BASE_STATUS} destroyed`;
	}
}

export { getMidiStatus, groupDevices };

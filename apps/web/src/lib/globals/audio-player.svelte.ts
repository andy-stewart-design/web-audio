export type LogEntry = {
	id: string;
	type: 'output' | 'error';
	message: string;
};

class AudioPlayer {
	isRunning = $state(false);
	lastError = $state<string | null>(null);

	async play(_code: string): Promise<LogEntry> {
		throw new Error('audioPlayer.play is not implemented yet');
	}

	stop(): void {
		this.isRunning = false;
	}
}

export const audioPlayer = new AudioPlayer();

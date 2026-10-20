interface ScheduledSource {
  onended: ((...args: never[]) => void) | null;
  connect(destination: AudioNode): AudioNode;
  disconnect(): void;
  start(when?: number): void;
  stop(when?: number): void;
}

type ScheduledVoiceSource =
  | { node: AudioBufferSourceNode; offset: number }
  | { node: ScheduledSource; offset?: undefined };

export type { ScheduledSource, ScheduledVoiceSource };

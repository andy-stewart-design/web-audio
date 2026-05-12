// Re-exports waveform functions for unit testing.
// These are defined inline in lfo-processor.ts (no exports) so the
// ?raw compiled string stays valid as a classic worklet script.

export function sine(phase: number): number {
  return Math.sin(2 * Math.PI * phase);
}

export function triangle(phase: number): number {
  return 1 - 4 * Math.abs(Math.round(phase) - phase);
}

export function sawtooth(phase: number): number {
  return 2 * (phase - Math.floor(phase + 0.5));
}

export function square(phase: number): number {
  return phase % 1 < 0.5 ? 1 : -1;
}

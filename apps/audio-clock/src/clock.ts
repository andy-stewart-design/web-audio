export type BeatCallback = (beat: number, time: number) => void;
export type BarCallback = (bar: number, time: number) => void;

export interface ClockOptions {
  bpm?: number;
  beatsPerBar?: number;
}

export class AudioClock {
  private _context: AudioContext;
  private _bpm: number;
  private _beatsPerBar: number;
  private _running: boolean = false;
  private _currentBeat: number = 0;
  private _currentBar: number = 0;
  private _startTime: number = 0;
  private _nextBeatTime: number = 0;
  private _destroyed: boolean = false;
  private _rafId: number | null = null;

  private beatCallbacks: Set<BeatCallback> = new Set();
  private barCallbacks: Set<BarCallback> = new Set();

  constructor(options: ClockOptions = {}) {
    this._bpm = options.bpm ?? 120;
    this._beatsPerBar = options.beatsPerBar ?? 4;
    this._context = new AudioContext();
  }

  // Poll audio clock and fire callbacks when beats pass
  private tick() {
    if (this._destroyed || !this._running) return;

    const currentTime = this._context.currentTime;

    // Fire callbacks for all beats that have passed
    while (this._nextBeatTime <= currentTime) {
      const beat = this._currentBeat;
      const bar = Math.floor(beat / this._beatsPerBar);
      const beatInBar = beat % this._beatsPerBar;
      const time = this._nextBeatTime;

      this._currentBar = bar;

      // Fire beat callbacks with precise scheduled time
      this.beatCallbacks.forEach((cb) => cb(beat, time));

      // Fire bar callbacks on first beat of bar
      if (beatInBar === 0) {
        this.barCallbacks.forEach((cb) => cb(bar, time));
      }

      // Advance to next beat
      this._currentBeat++;
      this._nextBeatTime += this.beatDuration;
    }

    this._rafId = requestAnimationFrame(() => this.tick());
  }

  public async start() {
    if (this._destroyed || this._running) return;

    // Resume audio context if suspended (browser autoplay policy)
    if (this._context.state === "suspended") {
      await this._context.resume();
    }

    this._running = true;
    this._startTime = this._context.currentTime;
    this._nextBeatTime = this._startTime;
    this._currentBeat = 0;
    this._currentBar = 0;

    this._rafId = requestAnimationFrame(() => this.tick());
  }

  public stop() {
    if (this._destroyed || !this._running) return;

    this._running = false;
    this._currentBeat = 0;
    this._currentBar = 0;

    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  public destroy() {
    this._destroyed = true;
    this.stop();
    this.beatCallbacks.clear();
    this.barCallbacks.clear();
    this._context.close();
  }

  public onBeat(callback: BeatCallback): () => void {
    this.beatCallbacks.add(callback);
    return () => this.beatCallbacks.delete(callback);
  }

  public onBar(callback: BarCallback): () => void {
    this.barCallbacks.add(callback);
    return () => this.barCallbacks.delete(callback);
  }

  get bpm(): number {
    return this._bpm;
  }

  set bpm(value: number) {
    if (value <= 0) return;
    this._bpm = value;
  }

  get beatsPerBar(): number {
    return this._beatsPerBar;
  }

  set beatsPerBar(value: number) {
    if (value <= 0) return;
    this._beatsPerBar = Math.floor(value);
  }

  get paused(): boolean {
    return !this._running;
  }

  get currentBeat(): number {
    return this._currentBeat;
  }

  get currentBeatInBar(): number {
    return this._currentBeat % this._beatsPerBar;
  }

  get currentBar(): number {
    return this._currentBar;
  }

  get beatDuration(): number {
    return 60 / this._bpm;
  }

  get barDuration(): number {
    return this.beatDuration * this._beatsPerBar;
  }

  get beatStartTime(): number {
    return this._startTime + this._currentBeat * this.beatDuration;
  }

  get nextBeatStartTime(): number {
    return this._startTime + (this._currentBeat + 1) * this.beatDuration;
  }

  get barStartTime(): number {
    return this._startTime + this._currentBar * this.barDuration;
  }

  get nextBarStartTime(): number {
    return this._startTime + (this._currentBar + 1) * this.barDuration;
  }

  get elapsedTime(): number {
    if (!this._running) return 0;
    return this._context.currentTime - this._startTime;
  }

  get context(): AudioContext {
    return this._context;
  }
}

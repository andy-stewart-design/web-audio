export type BeatCallback = (beat: number, time: number) => void;
export type BarCallback = (bar: number, time: number) => void;

export interface ClockOptions {
  bpm?: number;
  beatsPerBar?: number;
}

export class AudioClock {
  static lookahead = 25.0; // How often to call scheduler (ms)
  static scheduleAheadTime = 0.1; // How far to look ahead (s)

  private _context: AudioContext;
  private _bpm: number;
  private _beatsPerBar: number;
  private _running: boolean = false;
  private _currentBeat: number = 0;
  private _currentBar: number = 0;
  private _nextBeatTime: number = 0;
  private _timerId: any = null;

  private beforeBeatCallbacks: Set<BeatCallback> = new Set();
  private onBeatCallbacks: Set<BeatCallback> = new Set();
  private beforeBarCallbacks: Set<BarCallback> = new Set();
  private onBarCallbacks: Set<BarCallback> = new Set();

  constructor(options: ClockOptions = {}) {
    this._bpm = options.bpm ?? 120;
    this._beatsPerBar = options.beatsPerBar ?? 4;
    this._context = new AudioContext();
  }

  private scheduler() {
    // While there are beats that need to be scheduled before the next lookahead...
    while (
      this._nextBeatTime <
      this._context.currentTime + AudioClock.scheduleAheadTime
    ) {
      this.scheduleBeat(
        this._currentBeat,
        this._currentBar,
        this._nextBeatTime,
      );
      this.advanceBeat();
    }
    this._timerId = setTimeout(() => this.scheduler(), AudioClock.lookahead);
  }

  private scheduleBeat(beat: number, bar: number, time: number) {
    // 1. Fire "Before Bar" if we are at the end of a bar (beat 0 about to start)
    if (beat === 0) {
      this.beforeBarCallbacks.forEach((cb) => cb(bar, time));
    }

    // 2. Fire "Before Beat"
    this.beforeBeatCallbacks.forEach((cb) => cb(beat, time));

    // 3. Fire "On Bar"
    if (beat === 0) {
      this.onBarCallbacks.forEach((cb) => cb(bar, time));
    }

    // 4. Fire "On Beat"
    this.onBeatCallbacks.forEach((cb) => cb(beat, time));
  }

  private advanceBeat() {
    const secondsPerBeat = 60.0 / this._bpm;
    this._nextBeatTime += secondsPerBeat;

    this._currentBeat++;
    if (this._currentBeat >= this._beatsPerBar) {
      this._currentBeat = 0;
      this._currentBar++;
    }
  }

  public async start() {
    if (this._running) return;

    // Resume context if suspended (browser security)
    if (this._context.state === "suspended") {
      await this._context.resume();
    }

    this._running = true;
    this._currentBeat = 0;
    this._currentBar = 0;
    // Set first beat slightly in the future to avoid immediate jitter
    this._nextBeatTime = this._context.currentTime + 0.05;
    this.scheduler();
  }

  public stop() {
    this._running = false;
    if (this._timerId) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
  }

  public destroy() {
    this.stop();
    this._context.close();
    this.beforeBeatCallbacks.clear();
    this.onBeatCallbacks.clear();
    this.beforeBarCallbacks.clear();
    this.onBarCallbacks.clear();
  }

  // --- Callback Registration ---

  public beforeBeat(callback: BeatCallback): () => void {
    this.beforeBeatCallbacks.add(callback);
    return () => this.beforeBeatCallbacks.delete(callback);
  }

  public onBeat(callback: BeatCallback): () => void {
    this.onBeatCallbacks.add(callback);
    return () => this.onBeatCallbacks.delete(callback);
  }

  public beforeBar(callback: BarCallback): () => void {
    this.beforeBarCallbacks.add(callback);
    return () => this.beforeBarCallbacks.delete(callback);
  }

  public onBar(callback: BarCallback): () => void {
    this.onBarCallbacks.add(callback);
    return () => this.onBarCallbacks.delete(callback);
  }

  // --- Getters / Setters ---

  get bpm(): number {
    return this._bpm;
  }
  set bpm(value: number) {
    this._bpm = Math.max(1, value);
  }

  get context() {
    return this._context;
  }

  get beatsPerBar(): number {
    return this._beatsPerBar;
  }
  set beatsPerBar(value: number) {
    this._beatsPerBar = Math.max(1, Math.floor(value));
  }

  get beatDuration(): number {
    return 60 / this._bpm;
  }
}

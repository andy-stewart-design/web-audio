export type BeatCallback = (beat: number, time: number) => void;
export type BarCallback = (bar: number, time: number) => void;

export class AudioClock {
  // Timing Configuration (ms and seconds)
  static lookahead = 25.0;
  static scheduleAheadTime = 0.1;

  /**
   * The "Before" Lead Time.
   * This ensures "before" callbacks fire at least 100ms early,
   * giving the main thread plenty of time to process them before
   * the actual audio-triggering "on" callbacks fire.
   */
  static beforeLeadTime = 0.1;

  private _context: AudioContext;
  private _bpm: number;
  private _beatsPerBar: number;
  private _running: boolean = false;
  private _timerId: any = null;

  // Real-time pointers for "On" events
  private _nextBeatTime: number = 0;
  private _currentBeat: number = 0;
  private _currentBar: number = 0;

  // Lookahead pointers for "Before" events
  private _nextBeforeTime: number = 0;
  private _beforeBeatCount: number = 0;
  private _beforeBarCount: number = 0;

  private beforeBeatCallbacks: Set<BeatCallback> = new Set();
  private onBeatCallbacks: Set<BeatCallback> = new Set();
  private beforeBarCallbacks: Set<BarCallback> = new Set();
  private onBarCallbacks: Set<BarCallback> = new Set();

  constructor(bpm = 120, beatsPerBar = 4) {
    this._bpm = bpm;
    this._beatsPerBar = beatsPerBar;
    this._context = new AudioContext();
  }

  private scheduler() {
    if (!this._running) return;

    const horizon = this._context.currentTime + AudioClock.scheduleAheadTime;

    /** * 1. PROCESS "BEFORE" CALLBACKS
     * We look further into the future (horizon + lead time) for these.
     */
    while (this._nextBeforeTime < horizon + AudioClock.beforeLeadTime) {
      this.fireBeforeCallbacks(
        this._beforeBeatCount,
        this._beforeBarCount,
        this._nextBeforeTime,
      );
      this.advanceBefore();
    }

    /** * 2. PROCESS "ON" CALLBACKS
     * These fire exactly when they are supposed to be scheduled.
     */
    while (this._nextBeatTime < horizon) {
      this.fireOnCallbacks(
        this._currentBeat,
        this._currentBar,
        this._nextBeatTime,
      );
      this.advanceBeat();
    }

    this._timerId = setTimeout(() => this.scheduler(), AudioClock.lookahead);
  }

  private fireBeforeCallbacks(beat: number, bar: number, time: number) {
    if (beat === 0) {
      this.beforeBarCallbacks.forEach((cb) => cb(bar, time));
    }
    this.beforeBeatCallbacks.forEach((cb) => cb(beat, time));
  }

  private fireOnCallbacks(beat: number, bar: number, time: number) {
    if (beat === 0) {
      this.onBarCallbacks.forEach((cb) => cb(bar, time));
    }
    this.onBeatCallbacks.forEach((cb) => cb(beat, time));
  }

  private advanceBefore() {
    this._nextBeforeTime += this.beatDuration;
    this._beforeBeatCount++;
    if (this._beforeBeatCount >= this._beatsPerBar) {
      this._beforeBeatCount = 0;
      this._beforeBarCount++;
    }
  }

  private advanceBeat() {
    this._nextBeatTime += this.beatDuration;
    this._currentBeat++;
    if (this._currentBeat >= this._beatsPerBar) {
      this._currentBeat = 0;
      this._currentBar++;
    }
  }

  public async start() {
    if (this._running) return;

    if (this._context.state === "suspended") {
      await this._context.resume();
    }

    const startTime = this._context.currentTime + 0.05;

    // Initialize "On" timeline
    this._currentBeat = 0;
    this._currentBar = 0;
    this._nextBeatTime = startTime;

    // Initialize "Before" timeline to match
    this._beforeBeatCount = 0;
    this._beforeBarCount = 0;
    this._nextBeforeTime = startTime;

    this._running = true;
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

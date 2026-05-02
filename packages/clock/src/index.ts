import type { ClockEventCallback, ClockEventType, Metronome } from "./types.js";

type ListenerMap = Map<ClockEventType, Set<ClockEventCallback>>;

class AudioClock {
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
  static lookaheadOffset = 0.1;

  readonly ctx: AudioContext;
  readonly metronome: Metronome = { beat: 0, bar: 0 };

  private _bpm: number;
  private _beatsPerBar: number;
  private _running: boolean = false;
  private _timeOrigin: number = 0;
  private _timerId: ReturnType<typeof setTimeout> | null = null;

  // Real-time pointers for "On" events
  private _nextBeatTime: number = 0;
  private _currentBeat: number = 0;
  private _currentBar: number = 0;
  private _barStart: number = 0;

  // Lookahead pointers for "Before" events
  private _nextBeforeTime: number = 0;
  private _beforeBeatCount: number = 0;
  private _beforeBarCount: number = 0;

  private listeners: ListenerMap = new Map();

  constructor(ctx: AudioContext, bpm = 120, beatsPerBar = 4) {
    this.ctx = ctx;
    this._bpm = bpm;
    this._beatsPerBar = beatsPerBar;
    this._timeOrigin = performance.now() - this.ctx.currentTime * 1000;
  }

  private scheduler() {
    if (!this._running) return;

    const horizon = this.ctx.currentTime + AudioClock.scheduleAheadTime;

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
    const m = { beat, bar };
    if (beat === 0) {
      this.listeners.get("prebar")?.forEach((cb) => cb(m, time));
    }
    this.listeners.get("prebeat")?.forEach((cb) => cb(m, time));
  }

  private fireOnCallbacks(beat: number, bar: number, time: number) {
    this.metronome.beat = beat;
    this.metronome.bar = bar;
    const m = { ...this.metronome };
    if (beat === 0) {
      this._barStart = time;
      this.listeners.get("bar")?.forEach((cb) => cb(m, time));
    }
    this.listeners.get("beat")?.forEach((cb) => cb(m, time));
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

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    const startTime = this.ctx.currentTime + 0.05;

    // Initialize "On" timeline
    this._currentBeat = 0;
    this._currentBar = 0;
    this._nextBeatTime = startTime;
    this._barStart = startTime;

    // Initialize "Before" timeline to match
    this._beforeBeatCount = 0;
    this._beforeBarCount = 0;
    this._nextBeforeTime = startTime;

    this._timeOrigin = performance.now() - this.ctx.currentTime * 1000;
    this._running = true;
    this.scheduler();

    this.listeners
      .get("start")
      ?.forEach((cb) => cb({ ...this.metronome }, startTime));
  }

  public stop() {
    this.listeners
      .get("stop")
      ?.forEach((cb) => cb({ ...this.metronome }, this.ctx.currentTime));
    this._running = false;
    if (this._timerId) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
    this.metronome.beat = 0;
    this.metronome.bar = 0;
  }

  public destroy() {
    this.stop();
    this.listeners.forEach((set) => set.clear());
    this.listeners.clear();
  }

  public audioTimeToMIDITime(audioTimeSeconds: number) {
    return this._timeOrigin + audioTimeSeconds * 1000;
  }

  // --- Event Registration ---

  public on(type: ClockEventType, fn: ClockEventCallback): () => void {
    let group = this.listeners.get(type);
    if (!group) {
      group = new Set();
      this.listeners.set(type, group);
    }
    group.add(fn);
    return () => group!.delete(fn);
  }

  public off(type: ClockEventType, fn: ClockEventCallback) {
    this.listeners.get(type)?.delete(fn);
  }

  // --- BPM ---

  public bpm(value: number) {
    if (value > 0) this._bpm = value;
  }

  // --- Getters ---

  get paused(): boolean {
    return !this._running;
  }

  get beatsPerMin(): number {
    return this._bpm;
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

  get beatStartTime(): number {
    return this._nextBeatTime;
  }

  get nextBeatStartTime(): number {
    return this._nextBeatTime + this.beatDuration;
  }

  get barStartTime(): number {
    return this._barStart;
  }

  get nextBarStartTime(): number {
    return this._barStart + this.barDuration;
  }

  get barDuration(): number {
    return this.beatDuration * this._beatsPerBar;
  }
}

export default AudioClock;
export type { Metronome };

class Envelope {
  private _startValue: number;
  private _maxValue: number;
  private _endValue: number;
  private _att = 0.005; // attact duration
  private _dec = 0.95; // decay duration
  private _sus = 1; // sustain value (as percent of max value)
  private _rel = 0.005; // release duration

  constructor(start: number, max: number, end?: number) {
    this._startValue = start;
    this._maxValue = max;
    this._endValue = end ?? start;
  }
}

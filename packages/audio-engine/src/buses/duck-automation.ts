import { MIN_RAMP } from "@/constants";

const MIN_DUCK_RAMP = MIN_RAMP * 4;

interface DuckRequest {
  depth: number;
  onset: number;
  recovery: number;
  duration: number;
  startTime: number;
}

interface DuckSegment {
  from: number;
  to: number;
  startTime: number;
  endTime: number;
}

class DuckAutomation {
  private readonly _target: AudioParam;
  private readonly _ctx: BaseAudioContext;
  private _segments: DuckSegment[] = [];
  private _scheduled = false;
  private _destroyed = false;

  constructor(ctx: BaseAudioContext, target: AudioParam) {
    this._ctx = ctx;
    this._target = target;
  }

  schedule(request: DuckRequest) {
    if (this._destroyed || request.depth === 0) return;

    const startTime = Math.max(this._ctx.currentTime, request.startTime);
    const target = depthToGain(request.depth);
    const heldValue = this._valueAt(startTime);
    const effectiveTarget = Math.min(heldValue, target);
    const onsetDuration = Math.max(
      MIN_DUCK_RAMP,
      request.onset * request.duration,
    );
    const recoveryDuration = Math.max(
      MIN_DUCK_RAMP,
      request.recovery * request.duration,
    );
    const onsetEnd = startTime + onsetDuration;
    const recoveryEnd = onsetEnd + recoveryDuration;

    if (this._scheduled) this._target.cancelAndHoldAtTime(startTime);
    this._target.setValueAtTime(heldValue, startTime);
    this._target.linearRampToValueAtTime(effectiveTarget, onsetEnd);
    this._target.linearRampToValueAtTime(1, recoveryEnd);

    this._segments = [
      {
        from: heldValue,
        to: effectiveTarget,
        startTime,
        endTime: onsetEnd,
      },
      {
        from: effectiveTarget,
        to: 1,
        startTime: onsetEnd,
        endTime: recoveryEnd,
      },
    ];
    this._scheduled = true;
  }

  stop(stopTime: number) {
    if (this._destroyed) return;

    const heldValue = this._valueAt(stopTime);
    this._target.cancelAndHoldAtTime(stopTime);
    this._target.setValueAtTime(heldValue, stopTime);

    if (heldValue === 1) {
      this._segments = [];
      this._scheduled = false;
      return;
    }

    const resetEnd = stopTime + MIN_DUCK_RAMP;
    this._target.linearRampToValueAtTime(1, resetEnd);
    this._segments = [
      {
        from: heldValue,
        to: 1,
        startTime: stopTime,
        endTime: resetEnd,
      },
    ];
    this._scheduled = true;
  }

  destroy() {
    this._destroyed = true;
    this._segments = [];
    this._scheduled = false;
  }

  private _valueAt(time: number) {
    if (this._segments.length === 0) return 1;

    for (const segment of this._segments) {
      if (time <= segment.startTime) return segment.from;
      if (time < segment.endTime) return valueAt(segment, time);
    }

    return this._segments.at(-1)!.to;
  }
}

function depthToGain(depth: number) {
  return Math.max(0.01, Math.min(1, 1 - Math.sqrt(depth)));
}

function valueAt(segment: DuckSegment, time: number) {
  const progress =
    (time - segment.startTime) / (segment.endTime - segment.startTime);
  return segment.from + (segment.to - segment.from) * progress;
}

export { DuckAutomation, MIN_DUCK_RAMP, depthToGain };
export type { DuckRequest };

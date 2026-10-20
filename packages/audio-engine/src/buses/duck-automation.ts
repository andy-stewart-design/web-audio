import { MIN_RAMP } from "@/constants";

const MIN_DUCK_RAMP = MIN_RAMP * 4;

interface DuckRequest {
  depth: number;
  onset: number;
  recovery: number;
  duration: number;
  startTime: number;
}

interface DuckTrigger extends DuckRequest {
  target: string;
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
  private _heldValue = 1;
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
    if (
      !Number.isFinite(startTime) ||
      !Number.isFinite(target) ||
      !Number.isFinite(onsetDuration) ||
      !Number.isFinite(recoveryDuration)
    ) {
      return;
    }

    const onsetEnd = startTime + onsetDuration;
    const recoveryEnd = onsetEnd + recoveryDuration;
    if (!Number.isFinite(onsetEnd) || !Number.isFinite(recoveryEnd)) return;

    if (this._scheduled) this._target.cancelAndHoldAtTime(startTime);
    this._target.setValueAtTime(heldValue, startTime);
    this._target.linearRampToValueAtTime(effectiveTarget, onsetEnd);
    this._target.linearRampToValueAtTime(1, recoveryEnd);

    const retainedSegments = this._segments.flatMap((segment) => {
      if (segment.endTime <= startTime) return [segment];
      if (segment.startTime < startTime) {
        return [{ ...segment, to: heldValue, endTime: startTime }];
      }
      return [];
    });
    this._segments = [
      ...retainedSegments,
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

    this._segments = [];
    this._heldValue = heldValue;
    this._scheduled = false;
  }

  destroy() {
    this._destroyed = true;
    this._segments = [];
    this._scheduled = false;
  }

  private _valueAt(time: number) {
    if (this._segments.length === 0) return this._heldValue;

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
export type { DuckRequest, DuckTrigger };

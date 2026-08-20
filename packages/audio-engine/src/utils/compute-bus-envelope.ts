import { MIN_RAMP } from "@/constants";
import type { ResolvedEnvelopeSchema } from "@/types";

function allocateRampDurations(
  attack: number,
  decay: number,
  release: number,
  duration: number,
) {
  if (duration <= MIN_RAMP * 3) {
    const ramp = duration / 3;
    return { attack: ramp, decay: ramp, release: ramp };
  }

  const raw = [attack, decay, release];
  const minimumTotal = MIN_RAMP * 3;
  const weights = raw.map((value) => Math.max(0, value - MIN_RAMP));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  if (
    raw.reduce((sum, value) => sum + Math.max(MIN_RAMP, value), 0) <= duration
  ) {
    return {
      attack: Math.max(MIN_RAMP, attack),
      decay: Math.max(MIN_RAMP, decay),
      release: Math.max(MIN_RAMP, release),
    };
  }

  const remaining = duration - minimumTotal;
  if (weightTotal === 0) {
    const ramp = duration / 3;
    return { attack: ramp, decay: ramp, release: ramp };
  }

  return {
    attack: MIN_RAMP + (weights[0] / weightTotal) * remaining,
    decay: MIN_RAMP + (weights[1] / weightTotal) * remaining,
    release: MIN_RAMP + (weights[2] / weightTotal) * remaining,
  };
}

function computeBusEnvelope(
  envelope: ResolvedEnvelopeSchema,
  startTime: number,
  duration: number,
) {
  const proportions = [envelope.a, envelope.d, envelope.r].map((value) =>
    Math.max(0, value),
  );
  const total = proportions.reduce((sum, value) => sum + value, 0);
  const scale = total > 1 ? 1 / total : 1;
  const ramps = allocateRampDurations(
    proportions[0] * scale * duration,
    proportions[1] * scale * duration,
    proportions[2] * scale * duration,
    duration,
  );
  const attackEnd = startTime + ramps.attack;
  const decayEnd = attackEnd + ramps.decay;
  const endTime = startTime + duration;
  const releaseStart = Math.max(decayEnd, endTime - ramps.release);

  return {
    min: envelope.min,
    max: envelope.max,
    sustain: envelope.min + (envelope.max - envelope.min) * envelope.s,
    startTime,
    attackEnd,
    decayEnd,
    releaseStart,
    endTime,
  };
}

export { computeBusEnvelope };

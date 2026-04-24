import { MIN_RAMP } from "../constants";
import { normalizeADSR } from "./normalize";
import type { EnvelopeParams, ResolvedEnvelopeSchema } from "@/types";

function computeEnvelope(
  envelope: ResolvedEnvelopeSchema,
  noteDuration: number,
  endTime: number,
  scale = 1,
): EnvelopeParams {
  const { a, d, s, r } = normalizeADSR(envelope);

  const min = envelope.min * scale;
  const max = envelope.max * scale;
  const sustain = min + (max - min) * s;

  const startTime = endTime - noteDuration;
  const attackDur = Math.max(a * noteDuration, MIN_RAMP);
  const decayDur = Math.max(d * noteDuration, MIN_RAMP);
  const releaseDur = Math.max(r * noteDuration, MIN_RAMP);

  return {
    min,
    max,
    sustain,
    startTime,
    endTime,
    attackDur,
    decayDur,
    releaseDur,
  };
}

export { computeEnvelope };

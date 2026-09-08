import type { ChanceCondition } from "@web-audio/schema";
import {
  chanceMapper,
  getSeed,
  mulberry32,
  seedToRand,
  xorwise,
} from "@/utils/random";

class ChanceResolver {
  private readonly condition: ChanceCondition;

  constructor(condition: ChanceCondition) {
    this.condition = condition;
  }

  resolveBar(barIndex: number, candidateCount: number) {
    const [currentSeed, seedOffset] = this.getSegmentInfo(barIndex);
    let seed = getSeed(currentSeed + seedOffset);
    const mapChance = chanceMapper(this.condition.probability);
    const decisions: boolean[] = [];

    for (let index = 0; index < candidateCount; index++) {
      let randomValue: number;
      if (this.condition.algorithm === "mulberry") {
        randomValue = mulberry32(seed);
        seed = (seed + 1) | 0;
      } else {
        randomValue = Math.abs(seedToRand(seed));
        seed = xorwise(seed);
      }
      decisions.push(mapChance(randomValue, 0, 1) === 1);
    }

    return this.condition.order === "reverse"
      ? decisions.toReversed()
      : decisions;
  }

  private getSegmentInfo(barIndex: number) {
    const segments = this.condition.segments;

    if (segments.length === 1 && segments[0].len === undefined) {
      return [segments[0].seed, barIndex] as const;
    }

    const totalPeriod = segments.reduce(
      (period, segment) => period + (segment.len ?? 0),
      0,
    );
    const position = barIndex % totalPeriod;
    let accumulated = 0;

    for (const segment of segments) {
      const length = segment.len ?? 0;
      if (position < accumulated + length) {
        return [segment.seed, position - accumulated] as const;
      }
      accumulated += length;
    }

    return [segments[0].seed, 0] as const;
  }
}

export default ChanceResolver;

import type { RandomSchema } from "@web-audio/schema";
import {
  getSeed,
  seedToRand,
  xorwise,
  mulberry32,
  floatMapper,
  intMapper,
  binaryMapper,
  quantizeMapper,
  type RandMapper,
} from "./utils/random";

class RandomResolver {
  private _schema: RandomSchema;
  private _mapper: RandMapper;
  private _cachedBar: number | null = null;
  private _cachedResult: number[] | null = null;

  constructor(schema: RandomSchema) {
    this._schema = schema;
    this._mapper = this._getMapper();
  }

  resolve(barIndex: number, stepIndex: number): number {
    const bar = this._generate(barIndex);
    return bar[stepIndex % bar.length];
  }

  private _getMapper(): RandMapper {
    if (this._schema.quantValue !== undefined) {
      return quantizeMapper(this._schema.quantValue);
    }
    switch (this._schema.dataType) {
      case "integer":
        return intMapper;
      case "binary":
        return binaryMapper;
      default:
        return floatMapper;
    }
  }

  private _getSegmentInfo(barIndex: number): readonly [number, number] {
    const segments = this._schema.segments;

    if (segments.length === 1 && segments[0].len === undefined) {
      return [segments[0].seed, barIndex] as const;
    }

    const totalPeriod = segments.reduce((a, s) => a + (s.len ?? 0), 0);
    const position = barIndex % totalPeriod;
    let accumulated = 0;

    for (const seg of segments) {
      const len = seg.len ?? 0;
      if (position < accumulated + len) {
        return [seg.seed, position - accumulated] as const;
      }
      accumulated += len;
    }

    return [segments[0].seed, 0] as const;
  }

  private _generate(barIndex: number): number[] {
    if (barIndex === this._cachedBar && this._cachedResult !== null) {
      return this._cachedResult;
    }

    const [currentSeed, seedOffset] = this._getSegmentInfo(barIndex);
    let seed = getSeed(currentSeed + seedOffset);

    const mask =
      this._schema.cycle.cycle[barIndex % this._schema.cycle.cycle.length];
    const rangeStart = this._schema.range?.min ?? 0;
    const rangeEnd = this._schema.range?.max ?? 1;

    const result: number[] = [];

    for (const step of mask) {
      if (step.value === 0) {
        result.push(0);
      } else {
        let rFloat: number;
        if (this._schema.algorithm === "mulberry") {
          rFloat = mulberry32(seed);
          seed = (seed + 1) | 0;
        } else {
          rFloat = Math.abs(seedToRand(seed));
          seed = xorwise(seed);
        }
        if (this._schema.valueMap) {
          // valueMap is self-sufficient: index directly from the raw float,
          // bypassing the range/dataType pipeline entirely.
          const index = Math.floor(rFloat * this._schema.valueMap.length);
          result.push(this._schema.valueMap[index]);
        } else {
          const mapped = this._mapper(rFloat, rangeStart, rangeEnd);
          result.push(mapped);
        }
      }
    }

    this._cachedBar = barIndex;
    this._cachedResult = result;
    return result;
  }
}

export default RandomResolver;

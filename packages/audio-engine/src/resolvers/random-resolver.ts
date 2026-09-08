import type { RandomNumberPattern } from "@web-audio/schema";
import {
  binaryMapper,
  floatMapper,
  getSeed,
  intMapper,
  mulberry32,
  quantizeMapper,
  seedToRand,
  xorwise,
  type RandMapper,
} from "@/utils/random";

class RandomResolver {
  private readonly schema: RandomNumberPattern;
  private readonly mapper: RandMapper;
  private cachedBar: number | null = null;
  private cachedResult: number[] | null = null;

  constructor(schema: RandomNumberPattern) {
    this.schema = schema;
    this.mapper = this.getMapper();
  }

  resolve(barIndex: number, valueIndex: number) {
    const bar = this.generate(barIndex);
    if (bar.length === 0) {
      throw new Error("Cannot resolve a random value from an empty bar");
    }
    return bar[valueIndex % bar.length];
  }

  private getMapper(): RandMapper {
    if (this.schema.quantValue !== undefined) {
      return quantizeMapper(this.schema.quantValue);
    }
    switch (this.schema.dataType) {
      case "integer":
        return intMapper;
      case "binary":
        return binaryMapper;
      default:
        return floatMapper;
    }
  }

  private getSegmentInfo(barIndex: number) {
    const segments = this.schema.segments;

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

  private generate(barIndex: number) {
    if (barIndex === this.cachedBar && this.cachedResult !== null) {
      return this.cachedResult;
    }

    const [currentSeed, seedOffset] = this.getSegmentInfo(barIndex);
    let seed = getSeed(currentSeed + seedOffset);
    const valueCount =
      this.schema.valuesPerBar[barIndex % this.schema.valuesPerBar.length];
    const rangeStart = this.schema.range?.min ?? 0;
    const rangeEnd = this.schema.range?.max ?? 1;
    const result: number[] = [];

    for (let index = 0; index < valueCount; index++) {
      let randomValue: number;
      if (this.schema.algorithm === "mulberry") {
        randomValue = mulberry32(seed);
        seed = (seed + 1) | 0;
      } else {
        randomValue = Math.abs(seedToRand(seed));
        seed = xorwise(seed);
      }

      if (this.schema.valueMap) {
        const mapIndex =
          this.schema.dataType === "binary"
            ? this.mapper(randomValue, rangeStart, rangeEnd)
            : Math.floor(randomValue * this.schema.valueMap.length);
        result.push(this.schema.valueMap[mapIndex]);
      } else {
        result.push(this.mapper(randomValue, rangeStart, rangeEnd));
      }
    }

    this.cachedBar = barIndex;
    this.cachedResult =
      this.schema.order === "reverse" ? result.toReversed() : result;
    return this.cachedResult;
  }
}

export default RandomResolver;

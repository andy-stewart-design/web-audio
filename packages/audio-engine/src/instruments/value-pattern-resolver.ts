import type {
  RandomNumberPattern,
  StaticValuePattern,
} from "@web-audio/schema";
import RandomResolver from "@/resolvers/random-resolver";

class ValuePatternResolver {
  private readonly randomResolvers = new Map<
    RandomNumberPattern,
    RandomResolver
  >();

  resolve<T>(
    pattern: StaticValuePattern<T> | RandomNumberPattern,
    barIndex: number,
    hitIndex: number,
  ): T | number {
    if (pattern.type === "random-number") {
      return this.getRandomResolver(pattern).resolve(barIndex, hitIndex);
    }

    const bar = pattern.cycle[barIndex % pattern.cycle.length];
    if (bar.length === 0) {
      throw new Error("Cannot resolve a static value from an empty bar");
    }
    return bar[hitIndex % bar.length];
  }

  private getRandomResolver(pattern: RandomNumberPattern) {
    let resolver = this.randomResolvers.get(pattern);
    if (!resolver) {
      resolver = new RandomResolver(pattern);
      this.randomResolvers.set(pattern, resolver);
    }
    return resolver;
  }
}

export default ValuePatternResolver;

import PatternCycle from "./pattern-cycle";
import type { StaticPattern } from "@web-audio/schema";

class ValueCycle extends PatternCycle<number> {
  constructor(defaultPattern: number[], nullValue: number) {
    super(defaultPattern, nullValue);
  }

  getStaticSchema() {
    const cycle = this.current.map((pattern, barIndex) => {
      if (pattern.length === 0) {
        throw new Error(
          `[Pattern] ValueCycle cannot serialize an empty bar at cycle[${barIndex}].`,
        );
      }
      if (pattern.some((value) => !Number.isFinite(value))) {
        throw new Error(
          `[Pattern] ValueCycle cycle[${barIndex}] must contain only finite numbers.`,
        );
      }
      return [...pattern];
    });

    return { type: "static", cycle } satisfies StaticPattern<number>;
  }
}

export { ValueCycle };

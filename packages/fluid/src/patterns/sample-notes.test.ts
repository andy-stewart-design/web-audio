import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import SampleNotes from "./sample-notes";

function rate(midi: number, root: number) {
  return Math.pow(2, (midi - root) / 12);
}

describe("SampleNotes — static schema", () => {
  it("root A4 (69), note A4 → rate 1.0", () => {
    const n = new SampleNotes([0]);
    n.root("A4");
    const schema = n.getSchema();
    expect(schema.type).toBe("static");
    if (schema.type !== "static") return;
    expect(schema.cycle[0][0].value).toBeCloseTo(1.0);
  });

  it("root A4, note A5 → rate 2.0", () => {
    const n = new SampleNotes([0]);
    n.root("A4").notes([12]);
    const schema = n.getSchema();
    expect(schema.type).toBe("static");
    if (schema.type !== "static") return;
    expect(schema.cycle[0][0].value).toBeCloseTo(2.0);
  });

  it("root A4, note A3 → rate 0.5", () => {
    const n = new SampleNotes([0]);
    n.root("A4").notes([-12]);
    const schema = n.getSchema();
    expect(schema.type).toBe("static");
    if (schema.type !== "static") return;
    expect(schema.cycle[0][0].value).toBeCloseTo(0.5);
  });

  it("no root set — defaults to A4, note 69 → rate 1.0", () => {
    const n = new SampleNotes([0]);
    const schema = n.getSchema();
    expect(schema.type).toBe("static");
    if (schema.type !== "static") return;
    expect(schema.cycle[0][0].value).toBeCloseTo(1.0);
  });
});

describe("SampleNotes — random schema with valueMap (scale mode)", () => {
  it("remaps valueMap entries from MIDI to playback rates", () => {
    const n = new SampleNotes([0]);
    n.root("C4").scale("maj").notes(new RandomCycle());
    const schema = n.getSchema();
    expect(schema.type).toBe("random");
    if (schema.type !== "random") return;
    expect(schema.valueMap).toBeDefined();
    if (!schema.valueMap) return;

    // C major from C4 (60): [60, 62, 64, 65, 67, 69, 71]
    const root = 60;
    expect(schema.valueMap[0]).toBeCloseTo(rate(60, root)); // C4 → 1.0
    expect(schema.valueMap[2]).toBeCloseTo(rate(64, root)); // E4
    expect(schema.valueMap[4]).toBeCloseTo(rate(67, root)); // G4
  });
});

describe("SampleNotes — random schema without valueMap", () => {
  it("builds a valueMap from the range and clears range", () => {
    const n = new SampleNotes([0]);
    n.root("A4").notes(new RandomCycle().range(69, 81));
    const schema = n.getSchema();
    expect(schema.type).toBe("random");
    if (schema.type !== "random") return;
    expect(schema.valueMap).toBeDefined();
    expect(schema.range).toBeUndefined();
    if (!schema.valueMap) return;
    // 69 → rate 1.0, 81 → rate 2.0
    expect(schema.valueMap[0]).toBeCloseTo(rate(69, 69));
    expect(schema.valueMap[schema.valueMap.length - 1]).toBeCloseTo(
      rate(80, 69),
    );
  });
});

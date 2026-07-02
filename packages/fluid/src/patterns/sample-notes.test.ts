import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import SampleNotes from "./sample-notes";

describe("SampleNotes — static schema", () => {
  it("defaults root to 0, note 0 → value 0", () => {
    const n = new SampleNotes([0]);
    const schema = n.getSchema();
    expect(schema.type).toBe("static");
    if (schema.type !== "static") return;
    expect(schema.cycle[0][0].value).toBe(0);
  });

  it("root A3, note 0 → MIDI value 57", () => {
    const n = new SampleNotes([0]);
    n.root("A3");
    const schema = n.getSchema();
    expect(schema.type).toBe("static");
    if (schema.type !== "static") return;
    expect(schema.cycle[0][0].value).toBe(57);
  });

  it("root A3, note 12 → MIDI value 69", () => {
    const n = new SampleNotes([0]);
    n.root("A3").notes([12]);
    const schema = n.getSchema();
    expect(schema.type).toBe("static");
    if (schema.type !== "static") return;
    expect(schema.cycle[0][0].value).toBe(69);
  });

  it("root A3 with minor scale resolves degrees to MIDI values", () => {
    const n = new SampleNotes([0]);
    n.root("A3").scale("min").notes([0, 2, 4, 6]);
    const schema = n.getSchema();
    expect(schema.type).toBe("static");
    if (schema.type !== "static") return;
    expect(schema.cycle[0].map((step) => step.value)).toEqual([57, 60, 64, 67]);
  });
});

describe("SampleNotes — random schema with valueMap (scale mode)", () => {
  it("emits target MIDI valueMap entries, not playback rates", () => {
    const n = new SampleNotes([0]);
    n.root("C4").scale("maj").notes(new RandomCycle());
    const schema = n.getSchema();
    expect(schema.type).toBe("random");
    if (schema.type !== "random") return;
    expect(schema.valueMap).toEqual([60, 62, 64, 65, 67, 69, 71]);
  });
});

describe("SampleNotes — random schema without valueMap", () => {
  it("preserves random range for engine-time note resolution", () => {
    const n = new SampleNotes([0]);
    n.notes(new RandomCycle().range(45, 57));
    const schema = n.getSchema();
    expect(schema.type).toBe("random");
    if (schema.type !== "random") return;
    expect(schema.valueMap).toBeUndefined();
    expect(schema.range).toEqual({ min: 45, max: 57 });
  });
});

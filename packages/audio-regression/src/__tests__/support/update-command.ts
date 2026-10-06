// Temporary, unapproved command fixtures only; production never imports this.
import { update } from "../../runner/update";
import { sketch } from "./cases";

const [referenceDirectory, mode, ...args] = process.argv.slice(2);
if (!referenceDirectory || !mode) throw new Error("Missing test command setup");
try {
  const original = sketch();
  const input =
    mode === "gain"
      ? sketch({ code: original.code.replace("gain(0.5)", "gain(0.55)") })
      : mode === "evaluation"
        ? sketch({
            code: "throw new Error('deliberate command update failure');",
          })
        : mode === "sample"
          ? sketch({
              code: `${original.code} d.loadSamples({bank: 'local', samples: {hit: ['/samples/missing.wav']}}); d.sample('hit').bank('local').push();`,
            })
          : original;
  await update(args, {
    registry: [input],
    referenceDirectory,
    report: console.log,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

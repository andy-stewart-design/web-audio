// Child-process driver for temporary, explicitly unapproved reference fixtures.
// Shares the production verifier and CLI exit policy without touching real references.
import { verify } from "../../runner/verify";
import { sketch } from "./cases";

const [referenceDirectory, artifactDirectory, mode, ...args] =
  process.argv.slice(2);
if (!referenceDirectory || !artifactDirectory || !mode)
  throw new Error("Missing test command setup");
try {
  const original = sketch();
  const registry =
    mode === "empty"
      ? []
      : [
          mode === "gain"
            ? sketch({ code: original.code.replace("gain(0.5)", "gain(0.55)") })
            : mode === "evaluation"
              ? sketch({
                  code: "throw new Error('deliberate command evaluation failure');",
                })
              : mode === "sample"
                ? sketch({
                    code: `${original.code} d.loadSamples({bank: 'local', samples: {hit: ['/samples/missing.wav']}}); d.sample('hit').bank('local').push();`,
                  })
                : original,
        ];
  const result = await verify(args, {
    registry,
    referenceDirectory,
    artifactDirectory,
    report: console.log,
  });
  if (!result.passed) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

import { fileURLToPath } from "node:url";
import { parseCaseSelector, selectCase } from "./cases";
import { loadCases } from "./runner/load-cases";
import { writeRecording } from "./runner/recording";
import { withRenderer } from "./runner/render";

try {
  const caseId = parseCaseSelector(process.argv.slice(2));
  const selected = selectCase(await loadCases(), caseId);
  await withRenderer(async (renderer) => {
    const result = await renderer.render(selected);
    console.log(`[${result.id}] Chromium ${result.browserVersion}`);
    console.log(
      `${result.settings.sampleRate} Hz, ${result.channels.length} channels, ${result.frameCount} frames, ${result.bpm} BPM`,
    );
    result.metrics.forEach(({ peak, rms }, channel) =>
      console.log(
        `Channel ${channel}: peak=${peak.toPrecision(6)} RMS=${rms.toPrecision(6)}`,
      ),
    );
    const output = fileURLToPath(
      new URL(`../artifacts/render/${result.id}.wav`, import.meta.url),
    );
    const paths = await writeRecording(output, result);
    console.log(`WAV: ${paths.wav}\nSettings: ${paths.json}`);
    console.log(
      "Render succeeded. Diagnostic recording only; no reference comparison or approval.",
    );
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

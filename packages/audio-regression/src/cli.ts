import { cases, parseCaseSelector, selectCase } from "./cases";
import { withRenderer } from "./runner/render";

try {
  const selected = selectCase(cases, parseCaseSelector(process.argv.slice(2)));
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
    console.log("Render succeeded. No reference comparison or WAV output yet.");
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

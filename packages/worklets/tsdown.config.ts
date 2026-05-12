import Raw from "unplugin-raw/rolldown";
import { defineConfig } from "tsdown";

export default defineConfig({
  // DTS is skipped — unplugin-raw's ?raw imports conflict with tsdown's
  // DTS generation. Types are generated via the `check` script instead.
  dts: false,
  exports: false,
  plugins: [Raw({ transform: true })],
  onSuccess: "cp src/types/index.d.mts dist/index.d.mts",
});

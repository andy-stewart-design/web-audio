import { rolldown } from "rolldown";
import type { Plugin } from "rolldown";
import { defineConfig } from "tsdown";

function workletPlugin(): Plugin {
  return {
    name: "rolldown-plugin-worklet",
    async resolveId(id, importer) {
      if (!id.endsWith("?worklet")) return;
      const cleanId = id.slice(0, -"?worklet".length);
      const resolved = await this.resolve(cleanId, importer);
      if (!resolved) return null;
      return `\0worklet:${resolved.id}`;
    },
    async load(id) {
      if (!id.startsWith("\0worklet:")) return;
      const entry = id.slice("\0worklet:".length);

      const build = await rolldown({
        input: entry,
        platform: "browser",
      });

      const { output } = await build.generate({
        format: "iife",
        sourcemap: false,
      });

      await build.close();

      return `export default ${JSON.stringify(output[0].code)}`;
    },
  };
}

export default defineConfig({
  dts: false,
  exports: false,
  plugins: [workletPlugin()],
  onSuccess: "cp src/types/index.d.mts dist/index.d.mts",
});

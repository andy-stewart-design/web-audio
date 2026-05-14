import { defineConfig } from "vitest/config";
import { rolldown } from "rolldown";
import type { Plugin } from "vite";

function workletPlugin(): Plugin {
  return {
    name: "vite-plugin-worklet",
    async load(id) {
      if (!id.endsWith("?worklet")) return;
      const entry = id.slice(0, -"?worklet".length);

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
  plugins: [workletPlugin()],
  test: {
    setupFiles: ["src/test-setup.ts"],
  },
});

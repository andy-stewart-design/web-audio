import { defineConfig } from "tsdown";

export default defineConfig({
  dts: {
    tsgo: true,
  },
  exports: true,
  deps: {
    alwaysBundle: ["@web-audio/worklets"],
  },
});

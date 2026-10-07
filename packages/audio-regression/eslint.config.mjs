import { config } from "@repo/eslint-config/base";

export default [
  ...config,
  { ignores: ["artifacts/**"] },
  {
    files: ["cases/*/sketch.js"],
    languageOptions: { globals: { d: "readonly", drome: "readonly" } },
  },
];

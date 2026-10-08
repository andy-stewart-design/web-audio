import { update } from "./runner/update";

try {
  await update(process.argv.slice(2), { report: console.log });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

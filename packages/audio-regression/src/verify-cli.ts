import { verify } from "./runner/verify";

try {
  const result = await verify(process.argv.slice(2), { report: console.log });
  if (!result.passed) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

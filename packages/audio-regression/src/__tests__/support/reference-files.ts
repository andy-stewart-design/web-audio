import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { expect } from "vitest";

// Snapshot the complete nested reference file tree, including unexpected files.
// Do not filter by extension: failures must preserve more than just known WAV/JSON pairs.
export async function snapshot(directory: string) {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  const names = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      bytes: await readFile(join(directory, name)),
    })),
  );
}

export async function expectUnchanged(
  directory: string,
  before: Awaited<ReturnType<typeof snapshot>>,
) {
  const after = await snapshot(directory);
  expect(after.map(({ name }) => name)).toEqual(before.map(({ name }) => name));
  expect(
    after.every(({ bytes }, index) => bytes.equals(before[index]!.bytes)),
  ).toBe(true);
}

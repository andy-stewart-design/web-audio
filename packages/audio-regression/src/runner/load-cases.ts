import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SETTINGS, selectCases } from "../cases";

export const CASE_DIRECTORY = fileURLToPath(
  new URL("../../cases/", import.meta.url),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectFields(value: unknown, allowed: string[], label: string) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length)
    throw new Error(`${label} has unknown fields: ${unknown.join(", ")}`);
  return value;
}

function numberField(object: Record<string, unknown>, key: string) {
  const value = object[key];
  if (typeof value !== "number") throw new Error(`${key} must be a number`);
  return value;
}

function parseMetadata(value: unknown) {
  const metadata = objectFields(
    value,
    [
      "description",
      "bars",
      "tailSeconds",
      "expectSilence",
      "settings",
      "resources",
    ],
    "metadata",
  );
  if (typeof metadata.description !== "string")
    throw new Error("description must be a string");
  if (
    metadata.expectSilence !== undefined &&
    typeof metadata.expectSilence !== "boolean"
  )
    throw new Error("expectSilence must be a boolean");

  let settings;
  if (metadata.settings !== undefined) {
    const input = objectFields(
      metadata.settings,
      Object.keys(DEFAULT_SETTINGS),
      "settings",
    );
    const setting = (key: keyof typeof DEFAULT_SETTINGS) =>
      input[key] === undefined
        ? DEFAULT_SETTINGS[key]
        : numberField(input, key);
    settings = {
      sampleRate: setting("sampleRate"),
      channels: setting("channels"),
      beatsPerBar: setting("beatsPerBar"),
      startOffsetFrames: setting("startOffsetFrames"),
    };
  }

  let resources;
  if (metadata.resources !== undefined) {
    if (!isRecord(metadata.resources))
      throw new Error("resources must be an object");
    resources = Object.fromEntries(
      Object.entries(metadata.resources).map(([source, file]) => {
        if (!source.trim() || typeof file !== "string" || !file.trim())
          throw new Error("Resources need source URLs and local file paths");
        return [source, file] as const;
      }),
    );
  }
  return {
    description: metadata.description,
    bars: numberField(metadata, "bars"),
    tailSeconds: numberField(metadata, "tailSeconds"),
    expectSilence: metadata.expectSilence,
    settings,
    resources,
  };
}

async function sampleResources(folder: string) {
  const samples = join(folder, "samples");
  let entries;
  try {
    entries = await readdir(samples, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return {};
    throw error;
  }
  return Object.fromEntries(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const file = join(entry.parentPath, entry.name);
        const source = relative(samples, file).split(sep).join("/");
        return [`/samples/${source}`, file] as const;
      }),
  );
}

// Node-only discovery. Browser-safe validation/planning stays in ../cases.
// Read source as text: importing/executing it here would change REPL semantics.
export async function loadCases(directory = CASE_DIRECTORY) {
  const root = resolve(directory);
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const registry = [];
  for (const entry of entries) {
    const folder = join(root, entry.name);
    try {
      const metadata = parseMetadata(
        JSON.parse(await readFile(join(folder, "metadata.json"), "utf8")),
      );
      const code = await readFile(join(folder, "sketch.js"), "utf8");
      registry.push({
        ...metadata,
        id: entry.name,
        code,
        resources: {
          ...(await sampleResources(folder)),
          ...Object.fromEntries(
            Object.entries(metadata.resources ?? {}).map(
              ([source, file]) => [source, resolve(folder, file)] as const,
            ),
          ),
        },
      });
    } catch (error) {
      throw new Error(
        `[${entry.name}] Could not load case at ${folder}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  // Invalid settings/IDs and empty coverage fail before any browser is started.
  return selectCases(registry);
}

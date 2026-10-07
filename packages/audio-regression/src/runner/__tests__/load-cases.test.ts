import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../cases";
import { loadCases } from "../load-cases";

const metadata = {
  description: "File-authored sketch",
  bars: 1,
  tailSeconds: 0.1,
};

async function withDirectory<T>(run: (directory: string) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "audio-case-files-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeCase(
  directory: string,
  id: string,
  value: unknown = metadata,
  code = "d.synth('sine').notes(69).push();\n",
) {
  const folder = join(directory, id);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "metadata.json"), JSON.stringify(value));
  await writeFile(join(folder, "sketch.js"), code);
  return folder;
}

describe("folder-authored case discovery", () => {
  it("discovers immediate case directories in stable ID order, ignoring root files and hidden directories", async () => {
    await withDirectory(async (directory) => {
      await writeCase(directory, "z-last");
      await writeCase(directory, "a-first");
      await writeFile(join(directory, "README.md"), "Case notes");
      await writeFile(join(directory, ".DS_Store"), "ignored");
      await mkdir(join(directory, ".hidden"));
      const registry = await loadCases(directory);
      expect(registry.map(({ id }) => id)).toEqual(["a-first", "z-last"]);
      expect(registry[0]).toMatchObject({
        ...metadata,
        settings: DEFAULT_SETTINGS,
        expectSilence: false,
        resources: {},
      });
    });
  });

  it("retains multiline source exactly without importing or executing it during discovery", async () => {
    await withDirectory(async (directory) => {
      const code =
        "// ordinary REPL JavaScript\nconst notes = [69, 72];\nfor (const note of notes) {\n  drome.synth('sine').notes(note).push();\n}\nthrow new Error('must not execute in Node');\n";
      await writeCase(directory, "multiline", metadata, code);
      expect((await loadCases(directory))[0]!.code).toBe(code);
    });
  });

  it("resolves mapped files relative to their own case, preserves exact URL keys and allows absolute/shared paths", async () => {
    await withDirectory(async (directory) => {
      const absolute = resolve(directory, "external.wav");
      for (const id of ["one", "two"]) {
        await writeCase(directory, id, {
          ...metadata,
          resources: {
            "/samples/hit.wav": "./samples/hit.wav",
            "https://example.invalid/builtin.wav": absolute,
            "/shared.wav": "../shared.wav",
          },
        });
      }
      const registry = await loadCases(directory);
      for (const input of registry)
        expect(input.resources).toEqual({
          "/samples/hit.wav": join(directory, input.id, "samples/hit.wav"),
          "https://example.invalid/builtin.wav": absolute,
          "/shared.wav": join(directory, "shared.wav"),
        });
      // Missing/unused files are not fetched or decoded by discovery; rendering owns diagnostics.
      expect(registry[0]!.resources["/samples/hit.wav"]).not.toBe(
        registry[1]!.resources["/samples/hit.wav"],
      );
    });
  });

  it("automatically maps colocated samples, including nested files, separately for each case", async () => {
    await withDirectory(async (directory) => {
      for (const id of ["one", "two"]) {
        const folder = await writeCase(directory, id);
        await mkdir(join(folder, "samples/drums"), { recursive: true });
        await writeFile(join(folder, "samples/hit.wav"), id);
        await writeFile(join(folder, "samples/drums/hit #1.wav"), id);
      }
      for (const input of await loadCases(directory))
        expect(input.resources).toEqual({
          "/samples/hit.wav": join(directory, input.id, "samples/hit.wav"),
          "/samples/drums/hit #1.wav": join(
            directory,
            input.id,
            "samples/drums/hit #1.wav",
          ),
        });
    });
  });

  it("lets explicit resources override automatic mappings without falling back when the override is missing", async () => {
    await withDirectory(async (directory) => {
      const folder = await writeCase(directory, "override", {
        ...metadata,
        resources: {
          "/samples/hit.wav": "../missing.wav",
          "https://example.invalid/shared.wav": "../shared.wav",
        },
      });
      await mkdir(join(folder, "samples"));
      await writeFile(join(folder, "samples/hit.wav"), "local input");
      expect((await loadCases(directory))[0]!.resources).toEqual({
        "/samples/hit.wav": join(directory, "missing.wav"),
        "https://example.invalid/shared.wav": join(directory, "shared.wav"),
      });
    });
  });

  it("applies optional settings and exact-silence opt-in through existing validation", async () => {
    await withDirectory(async (directory) => {
      await writeCase(
        directory,
        "silent",
        {
          ...metadata,
          settings: { sampleRate: 44100, channels: 1 },
          expectSilence: true,
        },
        "",
      );
      expect((await loadCases(directory))[0]).toMatchObject({
        code: "",
        expectSilence: true,
        settings: { ...DEFAULT_SETTINGS, sampleRate: 44100, channels: 1 },
      });
    });
  });

  it("reads edits and newly added cases on each discovery, without a source cache or central registry", async () => {
    await withDirectory(async (directory) => {
      const folder = await writeCase(directory, "one");
      expect(await loadCases(directory)).toHaveLength(1);
      await writeFile(join(folder, "sketch.js"), "d.bpm(90);\n");
      await writeFile(
        join(folder, "metadata.json"),
        JSON.stringify({ ...metadata, bars: 2 }),
      );
      await writeCase(directory, "two");
      const registry = await loadCases(directory);
      expect(registry).toHaveLength(2);
      expect(registry[0]).toMatchObject({
        id: "one",
        code: "d.bpm(90);\n",
        bars: 2,
      });
    });
  });

  it("rejects missing/empty roots rather than silently passing empty coverage", async () => {
    await withDirectory(async (directory) => {
      await expect(loadCases(join(directory, "absent"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(loadCases(directory)).rejects.toThrow(
        "Case registry is empty",
      );
    });
  });

  it.each(["metadata.json", "sketch.js"])(
    "reports the case ID/path when %s is missing",
    async (file) => {
      await withDirectory(async (directory) => {
        const folder = await writeCase(directory, "broken");
        await rm(join(folder, file));
        await expect(loadCases(directory)).rejects.toThrow(
          `[broken] Could not load case at ${folder}`,
        );
        await expect(loadCases(directory)).rejects.toThrow(file);
      });
    },
  );

  it("labels invalid JSON and refuses an invalid folder ID", async () => {
    await withDirectory(async (directory) => {
      const folder = await writeCase(directory, "broken");
      await writeFile(join(folder, "metadata.json"), "{not json}");
      await expect(loadCases(directory)).rejects.toThrow(
        "[broken] Could not load case",
      );
      await rm(folder, { recursive: true });
      await writeCase(directory, "Invalid-ID");
      await expect(loadCases(directory)).rejects.toThrow(
        "Invalid case ID: Invalid-ID",
      );
    });
  });

  it.each([
    [null, "metadata must be an object"],
    [[], "metadata must be an object"],
    [{ ...metadata, id: "other" }, "unknown fields: id"],
    [{ ...metadata, code: "not the source file" }, "unknown fields: code"],
    [{ ...metadata, bar: 2 }, "unknown fields: bar"],
    [{ bars: 1, tailSeconds: 0 }, "description must be a string"],
    [{ ...metadata, description: " " }, "description"],
    [{ ...metadata, bars: "1" }, "bars must be a number"],
    [{ ...metadata, bars: 0 }, "bars must be a positive integer"],
    [{ ...metadata, tailSeconds: -1 }, "tailSeconds"],
    [{ ...metadata, tailSeconds: null }, "tailSeconds must be a number"],
    [
      { ...metadata, expectSilence: "false" },
      "expectSilence must be a boolean",
    ],
    [{ ...metadata, settings: [] }, "settings must be an object"],
    [
      { ...metadata, settings: { rate: 48000 } },
      "settings has unknown fields: rate",
    ],
    [
      { ...metadata, settings: { channels: null } },
      "channels must be a number",
    ],
    [{ ...metadata, settings: { sampleRate: 1 } }, "Invalid sampleRate"],
    [{ ...metadata, settings: { channels: 0 } }, "channels must be an integer"],
    [{ ...metadata, settings: { beatsPerBar: 0 } }, "beatsPerBar"],
    [{ ...metadata, settings: { startOffsetFrames: -1 } }, "startOffsetFrames"],
    [{ ...metadata, resources: [] }, "resources must be an object"],
    [{ ...metadata, resources: { "/hit.wav": 1 } }, "Resources need"],
    [{ ...metadata, resources: { "": "hit.wav" } }, "Resources need"],
    [{ ...metadata, resources: { "/hit.wav": " " } }, "Resources need"],
  ])("rejects malformed metadata %j", async (value, diagnostic) => {
    await withDirectory(async (directory) => {
      await writeCase(directory, "broken", value);
      await expect(loadCases(directory)).rejects.toThrow(String(diagnostic));
    });
  });

  it("loads the migrated case files and colocated resources, allowing newly authored cases", async () => {
    const registry = await loadCases();
    expect(registry.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "lfo-filter",
        "sample-alternate",
        "sample-reverse",
        "sample-tone",
        "seeded-multibar",
        "sine",
      ]),
    );
    for (const input of registry) {
      expect(input.code.trim()).not.toBe("");
      for (const file of Object.values(input.resources)) {
        const bytes = await readFile(file);
        expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
        expect(file).toContain(`/cases/${input.id}/samples/`);
      }
    }
  });
});

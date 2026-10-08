import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve } from "node:path";

const prefix = "/__audio_resources/";

// Node serves actual file bytes over loopback HTTP; browser fetch/decode are real.
// Each mount owns unique URLs so concurrent contexts cannot share fixture state.
export function createResourceServer(root: string) {
  const files = new Map<string, { file: string; errors: string[] }>();
  return {
    mount(resources: Record<string, string>) {
      const base = `${prefix}${randomUUID()}/`;
      const errors: string[] = [];
      // Resolve all entries before registering any, so malformed input cannot
      // leave a partially mounted resource set behind.
      const entries = Object.entries(resources).map(([source, file]) => ({
        source,
        file: resolve(root, file),
        url: `${base}${encodeURIComponent(source)}`,
      }));
      const urls = Object.fromEntries(
        entries.map(({ source, url }) => [source, url] as const),
      );
      for (const { file, url } of entries) files.set(url, { file, errors });
      return {
        urls,
        errors,
        dispose() {
          for (const url of Object.values(urls)) files.delete(url);
        },
      };
    },
    async serve(
      request: IncomingMessage,
      response: ServerResponse,
      next: () => void,
    ) {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      if (!path.startsWith(prefix)) return next();
      response.setHeader("Cache-Control", "no-store");
      const entry = files.get(path);
      if (!entry) {
        response.writeHead(404).end("Unknown local audio resource");
        return;
      }
      try {
        if (!(await stat(entry.file)).isFile())
          throw new Error("Resource is not a regular file");
        const bytes = await readFile(entry.file);
        const mime =
          extname(entry.file) === ".wav"
            ? "audio/wav"
            : "application/octet-stream";
        if (!response.destroyed) {
          response.writeHead(200, {
            "Content-Type": mime,
            "Content-Length": bytes.length,
          });
          response.end(bytes);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        entry.errors.push(`Local resource ${entry.file}: ${message}`);
        const missing =
          error instanceof Error && "code" in error && error.code === "ENOENT";
        if (!response.destroyed)
          response
            .writeHead(missing ? 404 : 500)
            .end("Failed to read local audio resource");
      }
    },
  };
}

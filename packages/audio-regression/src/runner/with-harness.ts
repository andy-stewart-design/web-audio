import { createServer as createHTTPServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createResourceServer } from "./resources";

const root = fileURLToPath(new URL("../../", import.meta.url));

export async function withHarness<T>(
  run: (
    origin: string,
    mountResources: ReturnType<typeof createResourceServer>["mount"],
  ) => Promise<T>,
  port = 0,
) {
  const resources = createResourceServer(root);
  const server = await createServer({
    root,
    plugins: [
      {
        name: "local-audio-resources",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            void resources.serve(request, response, next).catch(next);
          });
        },
      },
    ],
    appType: "mpa",
    configFile: false,
    envFile: false,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  // Vite treats port 0 as its default port. Own the HTTP listener so the OS
  // assigns a genuinely ephemeral port without probe/rebind races.
  const http = createHTTPServer(server.middlewares);
  try {
    await new Promise<void>((resolve, reject) => {
      http.once("error", reject);
      http.listen(port, "127.0.0.1", resolve);
    });
    const address = http.address();
    if (!address || typeof address === "string")
      throw new Error("Harness has no loopback address");
    return await run(`http://127.0.0.1:${address.port}`, resources.mount);
  } finally {
    try {
      if (http.listening) {
        await new Promise<void>((resolve, reject) =>
          http.close((error) => (error ? reject(error) : resolve())),
        );
      }
    } finally {
      await server.close();
    }
  }
}

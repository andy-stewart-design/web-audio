import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));

export async function withHarness<T>(
  run: (origin: string) => Promise<T>,
  port = 0,
) {
  const server = await createServer({
    root,
    appType: "mpa",
    configFile: false,
    envFile: false,
    logLevel: "error",
    server: { host: "127.0.0.1", port, strictPort: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string")
      throw new Error("Harness has no loopback address");
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await server.close();
  }
}

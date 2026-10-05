import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { withHarness } from "../with-harness";
import { withRenderer } from "../render";

async function withOccupiedPort<T>(run: (port: number) => Promise<T>) {
  const server = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test port");
    return await run(address.port);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("owned harness lifecycle", () => {
  it("serves loopback HTML on an available port and closes after callback failure", async () => {
    let origin = "";
    await expect(
      withHarness(async (url) => {
        origin = url;
        expect(new URL(url).hostname).toBe("127.0.0.1");
        expect((await fetch(url)).status).toBe(200);
        throw new Error("harness callback failed");
      }),
    ).rejects.toThrow("harness callback failed");
    await expect(fetch(origin)).rejects.toThrow();
  });

  it("allocates distinct ephemeral listeners while another harness is running", async () => {
    await withHarness(async (first) => {
      await withHarness(async (second) => {
        expect(new URL(first).port).not.toBe(new URL(second).port);
        expect((await fetch(first)).ok).toBe(true);
        expect((await fetch(second)).ok).toBe(true);
      });
    });
  });

  it("rejects an occupied port without invoking the callback and recovers", async () => {
    let port = 0;
    const callback = vi.fn(async () => {});
    await withOccupiedPort(async (occupied) => {
      port = occupied;
      await expect(withHarness(callback, occupied)).rejects.toThrow(
        /already in use/,
      );
      expect(callback).not.toHaveBeenCalled();
    });
    await withHarness(async (origin) => {
      expect(new URL(origin).port).toBe(String(port));
      expect((await fetch(origin)).ok).toBe(true);
    }, port);
  });

  it("releases the server after browser launch failure and allows a fresh launch", async () => {
    const port = await withOccupiedPort(async (occupied) => occupied);
    const callback = vi.fn(async () => {});
    await expect(
      withRenderer(callback, {
        port,
        launchOptions: {
          executablePath: join(
            tmpdir(),
            `audio-regression-missing-${randomUUID()}`,
          ),
        },
      }),
    ).rejects.toThrow(/executable.*doesn't exist/i);
    expect(callback).not.toHaveBeenCalled();
    await withRenderer(
      async (renderer) => {
        expect(renderer.browser.isConnected()).toBe(true);
        expect(new URL(renderer.origin).port).toBe(String(port));
      },
      { port },
    );
  });
});

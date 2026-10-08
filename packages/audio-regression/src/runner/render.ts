import type { Browser, Request } from "playwright";
import { normalizeCase } from "../cases";
import type { SketchCase } from "../types";
import { inspectAudio } from "./audio";
import type { createResourceServer } from "./resources";
import { withBrowser } from "./with-browser";
import { withHarness } from "./with-harness";

function createRenderer(
  browser: Browser,
  origin: string,
  timeoutMs: number,
  mountResources: ReturnType<typeof createResourceServer>["mount"],
) {
  return {
    browser,
    origin,
    async render(input: SketchCase) {
      const sketch = normalizeCase(input);
      const resources = mountResources(sketch.resources);
      const context = await browser
        .newContext({ serviceWorkers: "block" })
        .catch((error: unknown) => {
          resources.dispose();
          throw error;
        });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const diagnostics: string[] = [];
      try {
        const work = async () => {
          await context.route("**/*", async (route) => {
            const url = route.request().url();
            if (new URL(url).origin === origin) await route.continue();
            else {
              diagnostics.push(`Blocked external request: ${url}`);
              await route.abort();
            }
          });
          const page = await context.newPage();
          const pending = new Set<Request>();
          let requestsSettled: (() => void) | undefined;
          const finishRequest = (request: Request) => {
            pending.delete(request);
            if (pending.size === 0) requestsSettled?.();
          };
          context.on("request", (request) => pending.add(request));
          context.on("requestfinished", finishRequest);
          page.on("pageerror", (error) => diagnostics.push(error.message));
          context.on("console", (message) => {
            if (message.type() === "error" || message.type() === "warning")
              diagnostics.push(message.text());
          });
          context.on("response", (response) => {
            if (response.status() >= 400)
              diagnostics.push(`HTTP ${response.status()}: ${response.url()}`);
          });
          context.on("requestfailed", (request) => {
            diagnostics.push(
              `Request failed: ${request.url()}: ${request.failure()?.errorText}`,
            );
            finishRequest(request);
          });
          await page.goto(origin, { timeout: timeoutMs });
          await page.waitForFunction(
            () => typeof window.renderSketch === "function",
            undefined,
            { timeout: timeoutMs },
          );
          const result = await page.evaluate(
            ({ sketch, urls }) => window.renderSketch(sketch, urls),
            { sketch, urls: resources.urls },
          );
          // Rendering can finish faster than an already-started fetch. Drain
          // observed requests (under the same deadline) before checking errors.
          if (pending.size) {
            await new Promise<void>((resolve) => {
              requestsSettled = resolve;
            });
          }
          if (diagnostics.length || resources.errors.length)
            throw new Error("Unexpected browser/resource diagnostics");
          const channels = result.channels.map((channel) =>
            Float32Array.from(channel),
          );
          const metrics = inspectAudio(channels, sketch.expectSilence);
          return {
            ...result,
            channels,
            metrics,
            browserVersion: browser.version(),
          };
        };
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Render timed out after ${timeoutMs} ms`)),
            timeoutMs,
          );
        });
        return await Promise.race([work(), timeout]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const messages = [...diagnostics, ...resources.errors];
        const details = messages.length ? `\n${messages.join("\n")}` : "";
        throw new Error(`[${sketch.id}] ${message}${details}`, {
          cause: error,
        });
      } finally {
        clearTimeout(timer);
        try {
          await context.close();
        } finally {
          resources.dispose();
        }
      }
    },
  };
}

export async function withRenderer<T>(
  run: (renderer: ReturnType<typeof createRenderer>) => Promise<T>,
  options: {
    timeoutMs?: number;
    port?: number;
    launchOptions?: Parameters<typeof withBrowser>[1];
  } = {},
) {
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 2 ** 31 - 1
  )
    throw new Error("timeoutMs must be a positive timer-safe integer");
  return withHarness(
    (origin, mountResources) =>
      withBrowser(
        (browser) =>
          run(createRenderer(browser, origin, timeoutMs, mountResources)),
        options.launchOptions,
      ),
    options.port,
  );
}

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser } from "playwright";
import { describe, expect, it } from "vitest";
import { withBrowser } from "../runner/with-browser";

describe("pinned Chromium launch (not audio verification)", () => {
  it("opens a page and closes the browser after success", async () => {
    let launched: Browser | undefined;
    const version = await withBrowser(async (browser) => {
      launched = browser;
      expect(browser.isConnected()).toBe(true);
      const page = await browser.newPage();
      await page.setContent("<title>Audio regression launch smoke</title>");
      expect(await page.title()).toBe("Audio regression launch smoke");
      return browser.version();
    });

    expect(version).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(launched?.isConnected()).toBe(false);
  });

  it("closes the browser when the callback fails", async () => {
    let launched: Browser | undefined;
    const failure = new Error("deliberate smoke callback failure");
    await expect(
      withBrowser(async (browser) => {
        launched = browser;
        await browser.newPage();
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(launched?.isConnected()).toBe(false);
  });

  it("rejects a missing executable and can launch normally afterwards", async () => {
    const directory = await mkdtemp(join(tmpdir(), "audio-regression-launch-"));
    try {
      const run = () => Promise.resolve("unexpected callback");
      await expect(
        withBrowser(run, {
          executablePath: join(directory, "missing-browser"),
        }),
      ).rejects.toThrow(/executable.*doesn't exist/i);
      expect(await withBrowser(async (browser) => browser.version())).toMatch(
        /^\d+\.\d+\.\d+\.\d+$/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

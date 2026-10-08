import { chromium, type Browser } from "playwright";

// Launch failure has no browser handle to release; Playwright owns its partial
// launch cleanup. Once launched, always close, including callback failures.
export async function withBrowser<T>(
  run: (browser: Browser) => Promise<T>,
  options: Parameters<typeof chromium.launch>[0] = {},
) {
  const browser = await chromium.launch({
    headless: true,
    timeout: 10_000,
    ...options,
  });
  try {
    return await run(browser);
  } finally {
    await browser.close();
  }
}

/** Shared headless Chromium (Playwright) for stores behind bot protection. */
import type { Browser, BrowserContext } from "playwright";
import { UA } from "./http";

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser) return browser;
  const { chromium } = await import("playwright");
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });
  return browser;
}

export async function newContext(): Promise<BrowserContext> {
  const b = await getBrowser();
  return b.newContext({
    userAgent: UA,
    locale: "en-AU",
    viewport: { width: 1366, height: 900 },
    extraHTTPHeaders: { "Accept-Language": "en-AU,en;q=0.9" },
  });
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

/** Heuristic: does this HTML/text look like an Imperva/Akamai/captcha wall? */
export function looksBlocked(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("pardon our interruption") ||
    t.includes("/_incapsula_") ||
    t.includes("incapsula") ||
    t.includes("access denied") ||
    t.includes("request unsuccessful") ||
    t.includes("are you a human") ||
    t.includes("captcha") ||
    t.includes("bot detection")
  );
}

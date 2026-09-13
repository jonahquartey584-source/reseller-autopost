// Shared helpers for the Playwright-driven marketplaces (Facebook
// Marketplace, Vinted, Depop). Each marketplace keeps its own saved login
// session under sessions/<marketplace>.json (created by `npm run login`).
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const SESSIONS_DIR = path.join(__dirname, "..", "..", "sessions");
const DEBUG_DIR = path.join(__dirname, "..", "..", "debug");

function sessionPath(marketplace) {
  return path.join(SESSIONS_DIR, `${marketplace}.json`);
}

function hasSession(marketplace) {
  return fs.existsSync(sessionPath(marketplace));
}

async function withBrowser(marketplace, fn) {
  if (!hasSession(marketplace)) {
    return {
      status: "error",
      message: `No saved login for ${marketplace}. Run: npm run login -- ${marketplace}`,
    };
  }

  const headless = process.env.BROWSER_HEADLESS !== "0";
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ storageState: sessionPath(marketplace) });
  const page = await context.newPage();

  try {
    const result = await fn(page, context);
    return result;
  } catch (err) {
    if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const shot = path.join(DEBUG_DIR, `${marketplace}-${Date.now()}.png`);
    try {
      await page.screenshot({ path: shot, fullPage: true });
    } catch {
      /* best effort */
    }
    return {
      status: "error",
      message: `${err.message} (screenshot saved: ${shot})`,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

function isDryRun() {
  return process.env.BROWSER_DRY_RUN === "1" || process.env.BROWSER_DRY_RUN === "true";
}

module.exports = { sessionPath, hasSession, withBrowser, isDryRun, SESSIONS_DIR, DEBUG_DIR };

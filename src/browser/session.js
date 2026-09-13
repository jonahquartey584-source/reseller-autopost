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

// Launch your real Chrome where it is installed, falling back to
// Playwright's bundled Chromium. This is ordinary Playwright configuration,
// not fingerprint spoofing: a normal browser build with a normal locale and
// viewport simply behaves less like a bare test harness.
async function launchBrowser(headless) {
  try {
    return await chromium.launch({ headless, channel: "chrome" });
  } catch {
    return await chromium.launch({ headless });
  }
}

// Pages that mean "the site refused the automated browser" rather than
// "the selector moved". Worth separating: one is a wall, the other is a bug.
const BLOCK_SIGNS = [
  "sorry, not authorized",
  "403 forbidden",
  "access denied",
  "unusual traffic",
  "are you a robot",
  "checking your browser",
];

async function detectBlock(page) {
  let body = "";
  try {
    body = ((await page.textContent("body")) || "").toLowerCase().slice(0, 4000);
  } catch {
    return null;
  }
  const hit = BLOCK_SIGNS.find((sign) => body.includes(sign));
  return hit || null;
}

// Call this right after navigating: a block page loads successfully and
// only shows up later as every field failing to fill, which reads like a
// selector bug. Returns an error result to hand straight back, or null.
async function blockedResult(page, marketplace) {
  const blocked = await detectBlock(page);
  if (!blocked) return null;
  return {
    status: "error",
    message:
      `${marketplace} blocked the automated browser (page said "${blocked}"). ` +
      `This is their bot protection, not a bug in the form filling — a saved ` +
      `login does not get past it. Try BROWSER_HEADLESS=0 to run a visible ` +
      `browser, or list this one by hand.`,
  };
}

async function withBrowser(marketplace, fn) {
  if (!hasSession(marketplace)) {
    return {
      status: "error",
      message: `No saved login for ${marketplace}. Run: npm run login -- ${marketplace}`,
    };
  }

  const headless = process.env.BROWSER_HEADLESS !== "0";
  const browser = await launchBrowser(headless);
  const context = await browser.newContext({
    storageState: sessionPath(marketplace),
    viewport: { width: 1440, height: 900 },
    locale: process.env.BROWSER_LOCALE || "en-GB",
    timezoneId: process.env.BROWSER_TIMEZONE || "Europe/London",
  });
  const page = await context.newPage();

  try {
    const result = await fn(page, context);
    return result;
  } catch (err) {
    const blocked = await detectBlock(page);
    if (blocked) {
      return {
        status: "error",
        message:
          `${marketplace} blocked the automated browser (page said "${blocked}"). ` +
          `This is their bot protection, not a bug in the form filling — a saved ` +
          `login does not get past it. Try BROWSER_HEADLESS=0 to run a visible ` +
          `browser, or list this one by hand.`,
      };
    }
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

module.exports = {
  sessionPath,
  hasSession,
  withBrowser,
  isDryRun,
  blockedResult,
  SESSIONS_DIR,
  DEBUG_DIR,
};

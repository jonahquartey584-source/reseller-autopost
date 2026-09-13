#!/usr/bin/env node
// One-time interactive login for a browser-automation marketplace.
// Usage: npm run login -- facebook_marketplace
//        npm run login -- vinted
//        npm run login -- depop
//
// Opens a real, visible browser window pointed at the marketplace's own
// login page. Log in there (including any 2FA) exactly as you normally
// would, then come back to this terminal and press Enter — your session
// cookies get saved to sessions/<marketplace>.json for the app to reuse.
require("dotenv").config();
const path = require("path");
const readline = require("readline");
const { chromium } = require("playwright");
const { sessionPath } = require("../src/browser/session");

const LOGIN_URLS = {
  facebook_marketplace: "https://www.facebook.com/login",
  vinted: `https://${process.env.VINTED_DOMAIN || "www.vinted.co.uk"}/`,
  depop: "https://www.depop.com/login/",
};

async function main() {
  const marketplace = process.argv[2];
  if (!marketplace || !LOGIN_URLS[marketplace]) {
    console.error(
      `Usage: npm run login -- <marketplace>\nSupported: ${Object.keys(LOGIN_URLS).join(", ")}`
    );
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(LOGIN_URLS[marketplace], { waitUntil: "domcontentloaded" });

  console.log(`\nLog in to ${marketplace} in the opened browser window.`);
  console.log("Once you're fully logged in (feed/homepage visible), come back here and press Enter...");

  await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });

  await context.storageState({ path: sessionPath(marketplace) });
  console.log(`Saved session to ${path.relative(process.cwd(), sessionPath(marketplace))}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

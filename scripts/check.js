#!/usr/bin/env node
// One command that answers "what is actually connected?" — run: npm run check
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const EBAY_VARS = [
  "EBAY_CLIENT_ID",
  "EBAY_CLIENT_SECRET",
  "EBAY_REFRESH_TOKEN",
  "EBAY_MERCHANT_LOCATION_KEY",
  "EBAY_FULFILLMENT_POLICY_ID",
  "EBAY_PAYMENT_POLICY_ID",
  "EBAY_RETURN_POLICY_ID",
  "EBAY_DEFAULT_CATEGORY_ID",
];

const BROWSER_MARKETS = ["depop", "vinted", "facebook_marketplace"];

const ok = (s) => `  \x1b[32m✓\x1b[0m ${s}`;
const bad = (s) => `  \x1b[31m✗\x1b[0m ${s}`;
const warn = (s) => `  \x1b[33m!\x1b[0m ${s}`;

async function checkEbayToken() {
  const { EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REFRESH_TOKEN } = process.env;
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET || !EBAY_REFRESH_TOKEN) return null;
  try {
    const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: EBAY_REFRESH_TOKEN,
        scope: "https://api.ebay.com/oauth/api_scope/sell.inventory",
      }),
    });
    const json = await res.json();
    return json.access_token
      ? { ok: true }
      : { ok: false, why: json.error_description || json.error || JSON.stringify(json) };
  } catch (err) {
    return { ok: false, why: err.message };
  }
}

(async () => {
  console.log("\n\x1b[1mReseller Autopost — connection check\x1b[0m\n");

  // --- Browser marketplaces ---
  console.log("\x1b[1mBrowser marketplaces\x1b[0m (Depop, Vinted, Facebook Marketplace)");
  let browserReady = 0;
  for (const m of BROWSER_MARKETS) {
    const p = path.join(__dirname, "..", "sessions", `${m}.json`);
    if (!fs.existsSync(p)) {
      console.log(bad(`${m} — no saved session. Run: npm run login -- ${m}`));
      continue;
    }
    let count = 0;
    try {
      count = (JSON.parse(fs.readFileSync(p, "utf8")).cookies || []).length;
    } catch {
      console.log(bad(`${m} — session file is corrupt, re-import it`));
      continue;
    }
    if (!count) {
      console.log(bad(`${m} — session file has no cookies, re-import it`));
    } else {
      console.log(ok(`${m} — ${count} cookies saved`));
      browserReady++;
    }
  }

  const dry = process.env.BROWSER_DRY_RUN === "1" || process.env.BROWSER_DRY_RUN === "true";
  console.log(
    dry
      ? warn("BROWSER_DRY_RUN=1 — these will fill the form but NOT publish (safe to test)")
      : warn("BROWSER_DRY_RUN=0 — these will publish for real")
  );

  // --- eBay ---
  console.log("\n\x1b[1meBay\x1b[0m (official API)");
  const missing = EBAY_VARS.filter((v) => !process.env[v]);
  const haveCreds = ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_REFRESH_TOKEN"].every(
    (v) => process.env[v]
  );

  if (!haveCreds) {
    console.log(bad("credentials not set: " + missing.join(", ")));
  } else {
    process.stdout.write("  … testing refresh token against eBay\r");
    const t = await checkEbayToken();
    if (t && t.ok) console.log(ok("refresh token works — eBay auth is live      "));
    else console.log(bad(`refresh token rejected: ${t ? t.why : "unknown"}      `));
  }

  const stillMissing = missing.filter(
    (v) => !["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_REFRESH_TOKEN"].includes(v)
  );
  if (stillMissing.length) {
    console.log(bad("still needed before eBay can post: " + stillMissing.join(", ")));
    console.log(
      "    ↳ these come from your eBay *seller* account (Seller Hub → Business Policies"
    );
    console.log("      and inventory location), not the developer portal.");
  }
  if (!process.env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL.includes("example.com")) {
    console.log(bad("PUBLIC_BASE_URL not set — eBay fetches photos itself and cannot reach 127.0.0.1"));
  } else {
    console.log(ok("PUBLIC_BASE_URL set"));
  }

  // --- Summary ---
  console.log("\n\x1b[1mBottom line\x1b[0m");
  if (browserReady) {
    console.log(
      `  ${browserReady} browser marketplace(s) ready to test right now${dry ? " (dry run)" : ""}.`
    );
  } else {
    console.log("  No browser marketplaces ready.");
  }
  console.log(
    stillMissing.length || !process.env.PUBLIC_BASE_URL
      ? "  eBay is NOT ready to post yet — see the ✗ lines above.\n"
      : "  eBay looks ready to post.\n"
  );
})();

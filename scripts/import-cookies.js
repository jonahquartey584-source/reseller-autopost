#!/usr/bin/env node
// Alternative to scripts/login.js for sites (like Depop) that block a
// Playwright-controlled browser from logging in at all.
//
// Instead of automating the login, you log in normally in your own everyday
// Chrome, export that session's cookies with a browser extension, and this
// script converts them into the storageState.json format Playwright expects.
//
// Usage: npm run import-cookies -- depop ~/Downloads/depop-cookies.json
//
// How to get the cookies file:
//   1. Install the "Cookie-Editor" extension in Chrome
//      (https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm)
//   2. Log into the marketplace normally in Chrome.
//   3. Click the Cookie-Editor icon -> Export -> Export as JSON.
//   4. Save that as a .json file and pass its path to this script.
const fs = require("fs");
const path = require("path");
const { sessionPath } = require("../src/browser/session");

// Base domains to match against — a cookie matches if its own domain is
// this exact domain OR any subdomain of it (e.g. "www.depop.com" and
// ".accounts.depop.com" both match base domain "depop.com").
const DOMAINS = {
  facebook_marketplace: ["facebook.com"],
  vinted: ["vinted.co.uk", "vinted.com"],
  depop: ["depop.com"],
};

function matchesDomain(cookieDomain, baseDomain) {
  const d = cookieDomain.replace(/^\./, "").toLowerCase();
  const base = baseDomain.toLowerCase();
  return d === base || d.endsWith("." + base);
}

function mapSameSite(value) {
  if (!value) return "Lax";
  const v = String(value).toLowerCase();
  if (v === "no_restriction" || v === "none") return "None";
  if (v === "strict") return "Strict";
  return "Lax";
}

function convertCookie(c) {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || "/",
    // Cookie-Editor uses expirationDate (seconds); Playwright wants
    // "expires" as seconds too, or -1 for a session cookie.
    expires: c.session || c.expirationDate === undefined ? -1 : c.expirationDate,
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
    sameSite: mapSameSite(c.sameSite),
  };
}

function main() {
  const [marketplace, cookiesFile] = process.argv.slice(2);
  if (!marketplace || !cookiesFile || !DOMAINS[marketplace]) {
    console.error(
      `Usage: npm run import-cookies -- <marketplace> <path-to-cookies.json>\nSupported: ${Object.keys(DOMAINS).join(", ")}`
    );
    process.exit(1);
  }

  const resolved = cookiesFile.startsWith("~")
    ? cookiesFile.replace("~", process.env.HOME)
    : cookiesFile;
  const raw = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const allCookies = Array.isArray(raw) ? raw : raw.cookies || [];

  const relevant = allCookies.filter((c) =>
    DOMAINS[marketplace].some((base) => matchesDomain(c.domain, base))
  );

  if (!relevant.length) {
    console.error(
      `No cookies found for ${marketplace} in that file. Make sure you exported cookies while on the ${marketplace} site.`
    );
    process.exit(1);
  }

  const storageState = {
    cookies: relevant.map(convertCookie),
    origins: [],
  };

  fs.writeFileSync(sessionPath(marketplace), JSON.stringify(storageState, null, 2));
  console.log(
    `Saved ${relevant.length} cookies to ${path.relative(process.cwd(), sessionPath(marketplace))}`
  );
}

main();

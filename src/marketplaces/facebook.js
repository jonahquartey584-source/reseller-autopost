// Facebook Marketplace has no public listing API for individual sellers,
// so this drives your own saved browser session instead (see
// `npm run login -- facebook_marketplace`).
//
// IMPORTANT: Facebook's markup changes often and automating it may
// conflict with Meta's terms of service. Selectors below are best-effort
// and UNVERIFIED — always do a BROWSER_DRY_RUN=1 pass first and watch it
// run with BROWSER_HEADLESS=0 before trusting it with a real account.
const path = require("path");
const { withBrowser, isDryRun } = require("../browser/session");
const { safeFill, safeClick, safeSetFiles } = require("../browser/formHelpers");
const { autoDescription } = require("./ebay");

const CREATE_URL = "https://www.facebook.com/marketplace/create/item";

async function post(listing) {
  return withBrowser("facebook_marketplace", async (page) => {
    const warnings = [];
    await page.goto(CREATE_URL, { waitUntil: "domcontentloaded" });

    const photoInput = page.locator('input[type="file"]').first();
    const photoPaths = (listing.photos || []).map((f) =>
      path.join(__dirname, "..", "..", "uploads", f)
    );
    if (photoPaths.length) {
      await safeSetFiles(photoInput, photoPaths, warnings, "photos");
    }

    await safeFill(page.getByLabel(/title/i), listing.name, warnings, "Title");
    await safeFill(page.getByLabel(/^price/i), String(listing.price), warnings, "Price");
    await safeFill(
      page.getByLabel(/description/i),
      listing.description || autoDescription(listing),
      warnings,
      "Description"
    );

    // Condition/category are usually custom dropdowns rather than plain
    // <select> elements on Facebook, so we leave them for you to confirm
    // manually the first few times rather than risk mis-clicking.
    if (listing.condition) {
      warnings.push(
        `Set Condition to "${listing.condition}" manually — Facebook's condition picker is not automated yet.`
      );
    }

    if (isDryRun()) {
      return {
        status: "dry-run",
        message: `Dry run: filled Facebook Marketplace form, did not publish.${
          warnings.length ? " Warnings: " + warnings.join("; ") : ""
        }`,
      };
    }

    await safeClick(page.getByRole("button", { name: /^next$/i }), warnings, "Next");
    await safeClick(page.getByRole("button", { name: /^publish$/i }), warnings, "Publish");
    await page.waitForTimeout(2000);

    return {
      status: "posted",
      message: warnings.length
        ? "Posted, but some fields may need a manual check: " + warnings.join("; ")
        : "Posted to Facebook Marketplace.",
    };
  });
}

module.exports = { post };

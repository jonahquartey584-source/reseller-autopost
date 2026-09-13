// Vinted has no public listing API, so this drives your own saved browser
// session instead (see `npm run login -- vinted`).
//
// Selectors are best-effort and UNVERIFIED — always do a
// BROWSER_DRY_RUN=1 pass first, ideally with BROWSER_HEADLESS=0 so you can
// watch it fill the form before it ever submits for real.
const path = require("path");
const { withBrowser, isDryRun } = require("../browser/session");
const { safeFill, safeClick, safeSetFiles } = require("../browser/formHelpers");
const { autoDescription } = require("./ebay");

function domain() {
  return process.env.VINTED_DOMAIN || "www.vinted.co.uk";
}

async function post(listing) {
  return withBrowser("vinted", async (page) => {
    const warnings = [];
    await page.goto(`https://${domain()}/items/new`, { waitUntil: "domcontentloaded" });

    const photoInput = page.locator('input[type="file"]').first();
    const photoPaths = (listing.photos || []).map((f) =>
      path.join(__dirname, "..", "..", "uploads", f)
    );
    if (photoPaths.length) {
      await safeSetFiles(photoInput, photoPaths, warnings, "photos");
    }

    await safeFill(page.getByLabel(/title/i), listing.name, warnings, "Title");
    await safeFill(
      page.getByLabel(/description/i),
      listing.description || autoDescription(listing),
      warnings,
      "Description"
    );
    await safeFill(page.getByLabel(/^price/i), String(listing.price), warnings, "Price");
    await safeFill(page.getByLabel(/brand/i), listing.brand, warnings, "Brand");
    await safeFill(page.getByLabel(/size/i), listing.size, warnings, "Size");

    // Category and condition on Vinted are multi-step custom pickers, not
    // plain <select> elements — left for manual confirmation for now.
    if (listing.category) {
      warnings.push(`Set Category to "${listing.category}" manually.`);
    }
    if (listing.condition) {
      warnings.push(`Set Condition to "${listing.condition}" manually.`);
    }

    if (isDryRun()) {
      return {
        status: "dry-run",
        message: `Dry run: filled Vinted form, did not publish.${
          warnings.length ? " Warnings: " + warnings.join("; ") : ""
        }`,
      };
    }

    await safeClick(page.getByRole("button", { name: /upload|publish|submit/i }), warnings, "Upload");
    await page.waitForTimeout(2000);

    return {
      status: "posted",
      message: warnings.length
        ? "Posted, but some fields may need a manual check: " + warnings.join("; ")
        : "Posted to Vinted.",
    };
  });
}

module.exports = { post };

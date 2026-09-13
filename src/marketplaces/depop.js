// Depop has no public listing API, so this drives your own saved browser
// session instead (see `npm run login -- depop`).
//
// Selectors are best-effort and UNVERIFIED — always do a
// BROWSER_DRY_RUN=1 pass first, ideally with BROWSER_HEADLESS=0 so you can
// watch it fill the form before it ever submits for real.
const path = require("path");
const { withBrowser, isDryRun, blockedResult } = require("../browser/session");
const { safeFill, safeClick, safeSetFiles } = require("../browser/formHelpers");
const { autoDescription } = require("./ebay");
const { resolveDelivery } = require("./delivery");

const CREATE_URL = "https://www.depop.com/products/new";

async function post(listing) {
  return withBrowser("depop", async (page) => {
    const warnings = [];
    await page.goto(CREATE_URL, { waitUntil: "domcontentloaded" });
    const blocked = await blockedResult(page, "depop");
    if (blocked) return blocked;

    const photoInput = page.locator('input[type="file"]').first();
    const photoPaths = (listing.photos || []).map((f) =>
      path.join(__dirname, "..", "..", "uploads", f)
    );
    if (photoPaths.length) {
      await safeSetFiles(photoInput, photoPaths, warnings, "photos");
    }

    await safeFill(
      page.getByLabel(/description/i),
      listing.description || autoDescription(listing),
      warnings,
      "Description"
    );
    await safeFill(page.getByLabel(/^price/i), String(listing.price), warnings, "Price");
    const delivery = resolveDelivery("depop", listing);
    if (delivery.apply) {
      await safeFill(
        page.getByLabel(/delivery|shipping/i),
        delivery.value,
        warnings,
        "Delivery price"
      );
    } else if (delivery.note) {
      warnings.push(delivery.note);
    }
    await safeFill(page.getByLabel(/brand/i), listing.brand, warnings, "Brand");
    await safeFill(page.getByLabel(/size/i), listing.size, warnings, "Size");

    if (listing.category) {
      warnings.push(`Set Category to "${listing.category}" manually.`);
    }
    if (listing.condition) {
      warnings.push(`Set Condition to "${listing.condition}" manually.`);
    }

    if (isDryRun()) {
      return {
        status: "dry-run",
        message: `Dry run: filled Depop form, did not publish.${
          warnings.length ? " Warnings: " + warnings.join("; ") : ""
        }`,
      };
    }

    await safeClick(page.getByRole("button", { name: /list item|publish|post/i }), warnings, "List item");
    await page.waitForTimeout(2000);

    return {
      status: "posted",
      message: warnings.length
        ? "Posted, but some fields may need a manual check: " + warnings.join("; ")
        : "Posted to Depop.",
    };
  });
}

module.exports = { post };

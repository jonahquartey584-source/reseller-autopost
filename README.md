# Reseller Autopost

A local app for cross-posting resale listings. **eBay posts for real** through
eBay's official Sell Inventory API. **Facebook Marketplace, Vinted, and
Depop** post by driving your own logged-in browser session (Playwright),
since none of them offer a public listing API for individual sellers.

Etsy, Shopify, Poshmark, Mercari, and OfferUp are shown in the UI as
"coming soon" — they are not wired up in this build.

## Setup

```bash
npm install
cp .env.example .env
# edit .env — see below
npm start
# open http://127.0.0.1:3000
```

If `APP_PASSWORD` is left blank in `.env`, the app skips the sign-in screen.

## eBay (real posting)

1. Create a **production** keyset at https://developer.ebay.com/my/keys.
2. Run through eBay's OAuth "authorization code" consent flow once (in
   their API Explorer or via a short script) to get a **refresh token**
   scoped to `sell.inventory`. Refresh tokens are long-lived (~18 months);
   you don't redo this for every listing.
3. In your eBay seller account, note the IDs for a merchant location and
   your fulfillment/payment/return **business policies** — the Inventory
   API requires all three.
4. Fill in `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REFRESH_TOKEN`,
   `EBAY_MERCHANT_LOCATION_KEY`, `EBAY_FULFILLMENT_POLICY_ID`,
   `EBAY_PAYMENT_POLICY_ID`, `EBAY_RETURN_POLICY_ID`,
   `EBAY_DEFAULT_CATEGORY_ID` in `.env`.
5. eBay's servers fetch your photos themselves — they can't reach
   `127.0.0.1`. Set `PUBLIC_BASE_URL` to a public https URL for this app
   (an `ngrok http 3000` / Cloudflare Tunnel URL while testing, or wherever
   you eventually deploy it) so `/uploads/<file>` resolves publicly.
6. Start with `EBAY_ENV=sandbox` and eBay's sandbox keys/policies until a
   test listing publishes cleanly, then switch to production.

## Facebook Marketplace / Vinted / Depop (browser automation)

These have no listing API, so the app reuses your own logged-in browser
session via [Playwright](https://playwright.dev).

1. **Log in once per marketplace:**
   ```bash
   npm run login -- facebook_marketplace
   npm run login -- vinted
   npm run login -- depop
   ```
   Each opens a real browser window. Log in there yourself (2FA and all),
   then press Enter in the terminal — your session is saved to
   `sessions/<marketplace>.json`.

2. **Dry-run first.** Leave `BROWSER_DRY_RUN=1` (the default) and set
   `BROWSER_HEADLESS=0` so you can watch the app fill in a listing form
   without ever clicking submit. Selectors on these sites are best-effort
   and unverified in this build — a dry run is how you catch a broken
   selector before it does anything on your real account.

3. Once a dry run looks right, set `BROWSER_DRY_RUN=0` to let it actually
   submit.

**Be aware:** automating these sites this way likely conflicts with their
terms of service, and their markup changes without notice — a selector
that works today may silently stop matching after a redesign (you'll see
it as a queued item that errors, with a debug screenshot saved under
`debug/`). Only run this against your own account, and check on it
periodically rather than assuming it's unattended-safe forever.

## How posting works

- Fill out the form, pick which live marketplaces to post to, and either
  post now or schedule a time.
- A background scheduler checks every 15 seconds for due, queued targets
  and posts them one at a time, updating each target's status (`queued` →
  `posting` → `posted`/`error`/`dry-run`).
- Scheduled posts only fire while this app is running. If it was offline
  when a post was due, it fires at next startup rather than being lost.
- Once any target for a listing is `posted`, a "Choose photo & create
  social post" button becomes available and generates a caption (name,
  price, description, hashtags from your tags) you can copy into whatever
  social app you post from — this app does not auto-post to social media.

## Files

- `server.js` — Express app, auth, uploads, listing/target API
- `src/store.js` — JSON-file-backed listing storage
- `src/scheduler.js` — polls for due targets and posts them
- `src/marketplaces/ebay.js` — real posting via eBay's REST API
- `src/marketplaces/{facebook,vinted,depop}.js` — Playwright automation
- `src/browser/session.js` — shared Playwright session/dry-run helpers
- `scripts/login.js` — one-time interactive login per marketplace
- `public/` — the UI

# Reseller Autopost

A local app for cross-posting resale listings. **eBay posts for real** through
eBay's official Sell Inventory API. **Facebook Marketplace, Vinted, and
Depop** post by driving your own logged-in browser session (Playwright),
since none of them offer a public listing API for individual sellers.

Etsy, Shopify, Poshmark, Mercari, and OfferUp are shown in the UI as
"coming soon" — they are not wired up in this build.

## Running it

Double-click **`start.command`** in Finder. It frees port 3000, updates,
checks what is connected, starts the server and opens the page.

(If macOS refuses to open it the first time: right-click → Open → Open.)

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
2. Get a **refresh token** (long-lived, ~18 months — you don't redo this
   for every listing). The developer portal's own "Get a User Token Here"
   shortcut only gives you a short-lived (~2hr) access token, not a real
   refresh token, so this app does the real OAuth handoff itself:
   1. Get a public URL for this app running (see step 5 below for the
      ngrok/tunnel setup — you need it for eBay's image fetching anyway).
   2. In developer.ebay.com → your keyset → **User Tokens** tab, under
      "Your eBay Sign-in Settings", edit your RuName and set **"Your auth
      accepted URL"** to `<your public URL>/oauth/ebay/callback`.
   3. Put your Client ID, Client Secret, and that RuName's name (not its
      URL — looks like `Jonah_Quartey-P-...`) into `.env` as
      `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RUNAME`, then
      `npm start` (or restart it).
   4. Click the **"Your branded eBay Production Sign In (OAuth)"** link
      shown on that same User Tokens page, sign in, and approve access.
   5. eBay redirects your browser to `/oauth/ebay/callback`, which
      exchanges the code and shows you the real refresh token once — copy
      it into `.env` as `EBAY_REFRESH_TOKEN` and restart the app.
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

   **If a site blocks the automated browser from logging in at all**
   (Depop and others increasingly detect and reject Playwright-controlled
   browsers, even for a real login), use the cookie-import path instead —
   it never automates the login step:
   ```bash
   npm run import-cookies -- depop ~/Downloads/depop-cookies.json
   ```
   1. Install the "Cookie-Editor" extension in your normal Chrome.
   2. Log into the marketplace normally, in that normal browser.
   3. Click Cookie-Editor → Export → Export as JSON, save the file.
   4. Run the command above with the path to that file.

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

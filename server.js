require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const multer = require("multer");

const store = require("./src/store");
const scheduler = require("./src/scheduler");
const { REGISTRY } = require("./src/marketplaces");
const { autoDescription } = require("./src/marketplaces/ebay");

const app = express();
const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || "";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  })
);

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, "uploads"),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || "";
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { files: 12, fileSize: 10 * 1024 * 1024 },
});

// Assets the login page itself needs, reachable before authentication.
const PUBLIC_PATHS = new Set(["/login.html", "/styles.css", "/oauth/ebay/callback"]);

// ---- Auth ----
function requireAuth(req, res, next) {
  if (!APP_PASSWORD || req.session.authed || PUBLIC_PATHS.has(req.path)) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Not signed in" });
  return res.redirect("/login.html");
}

app.post("/api/login", (req, res) => {
  if (!APP_PASSWORD || req.body.password === APP_PASSWORD) {
    req.session.authed = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "Wrong password" });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ---- One-time eBay OAuth handoff ----
// eBay's developer portal "Get a User Token Here" shortcut only issues a
// short-lived (~2hr) access token, not a real refresh token. To get the
// long-lived refresh token our app actually needs, we do the real
// "authorization code" exchange ourselves. Point your RuName's "auth
// accepted URL" at this route (via your ngrok/tunnel URL +
// /oauth/ebay/callback), then visit the "...Sign In (OAuth)" link from the
// developer portal — eBay redirects your browser here with a `code`, and
// this route trades it for a refresh token and shows it to you once.
app.get("/oauth/ebay/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing ?code from eBay redirect.");
  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET || !process.env.EBAY_RUNAME) {
    return res
      .status(500)
      .send("Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RUNAME in .env first, then restart the server.");
  }

  const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString(
    "base64"
  );
  try {
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.EBAY_RUNAME,
      }),
    });
    const json = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(500).send(`<pre>${escapeHtml(JSON.stringify(json, null, 2))}</pre>`);
    }
    res.send(`
      <body style="font-family:monospace;background:#0b0c10;color:#f2f2f5;padding:24px;">
        <h2>eBay token exchange succeeded</h2>
        <p>Copy the value below into your .env as <b>EBAY_REFRESH_TOKEN</b>, then restart the app. This page will not show it again.</p>
        <pre style="white-space:pre-wrap;word-break:break-all;background:#1a1c26;padding:12px;border-radius:8px;">${escapeHtml(
          json.refresh_token
        )}</pre>
        <p>Refresh token valid for ~${Math.round((json.refresh_token_expires_in || 0) / 86400)} days from now.</p>
      </body>
    `);
  } catch (err) {
    res.status(500).send(`Error exchanging code: ${escapeHtml(err.message)}`);
  }
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

app.get("/api/session", (req, res) => {
  res.json({ authed: !APP_PASSWORD || !!req.session.authed });
});

app.use(requireAuth);
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---- Marketplace metadata for the UI ----
app.get("/api/marketplaces", (req, res) => {
  const live = Object.entries(REGISTRY).map(([id, m]) => ({ id, label: m.label, kind: m.kind }));
  const comingSoon = [
    { id: "etsy", label: "Etsy" },
    { id: "shopify", label: "Shopify" },
    { id: "poshmark", label: "Poshmark" },
    { id: "mercari", label: "Mercari" },
    { id: "offerup", label: "OfferUp" },
  ];
  res.json({ live, comingSoon });
});

// ---- Listings ----
app.post("/api/listings", upload.array("photos", 12), (req, res, next) => {
  (async () => {
    const body = req.body;
    const marketplaces = [].concat(body.marketplaces || []).filter(Boolean);
    if (!marketplaces.length) {
      return res.status(400).json({ error: "Choose at least one marketplace" });
    }
    if (!body.name) {
      return res.status(400).json({ error: "Product name is required" });
    }

    const postAt =
      body.postingTime === "schedule" && body.scheduledAt
        ? new Date(body.scheduledAt).getTime()
        : Date.now();

    const listing = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      name: body.name,
      price: Number(body.price) || 0,
      deliveryPrice: body.deliveryPrice === "" ? null : Number(body.deliveryPrice),
      currency: body.currency || "GBP",
      brand: body.brand || "",
      size: body.size || "",
      colour: body.colour || "",
      condition: body.condition || "",
      category: body.category || "",
      quantity: Number(body.quantity) || 1,
      tags: (body.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      description: body.description || "",
      photos: (req.files || []).map((f) => f.filename),
      targets: marketplaces.map((m) => ({
        marketplace: m,
        status: "queued",
        postAt,
        message: null,
        url: null,
        externalId: null,
        updatedAt: Date.now(),
      })),
    };

    await store.add(listing);
    res.status(201).json(listing);
  })().catch(next);
});

app.get("/api/listings", (req, res) => {
  res.json(store.getAll());
});

app.post("/api/listings/:id/targets/:marketplace/cancel", (req, res, next) => {
  (async () => {
    const updated = await store.updateTarget(req.params.id, req.params.marketplace, (t) => {
      if (t.status === "queued") {
        t.status = "cancelled";
        t.updatedAt = Date.now();
      }
    });
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  })().catch(next);
});

app.post("/api/listings/:id/social-caption", (req, res) => {
  const listing = store.getById(req.params.id);
  if (!listing) return res.status(404).json({ error: "Not found" });
  const published = listing.targets.some((t) => t.status === "posted");
  if (!published) {
    return res.status(400).json({ error: "Social posting unlocks after a marketplace listing is published" });
  }
  const tagString = listing.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ");
  const caption = `${listing.name} — £${listing.price}${
    listing.deliveryPrice != null ? ` (+£${listing.deliveryPrice} delivery)` : ""
  }\n${listing.description || autoDescription(listing)}\n${tagString}`.trim();
  res.json({ caption });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

app.listen(PORT, () => {
  console.log(`Reseller Autopost running at http://127.0.0.1:${PORT}`);
  scheduler.start();
});

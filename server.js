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
const PUBLIC_PATHS = new Set(["/login.html", "/styles.css"]);

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

const ebay = require("./ebay");
const facebook = require("./facebook");
const vinted = require("./vinted");
const depop = require("./depop");

// Marketplaces the app can actually post to. Anything else the UI shows
// (Etsy, Shopify, Poshmark, Mercari, OfferUp) is listed as "coming soon" —
// see public/app.js — rather than silently pretending to work.
const REGISTRY = {
  ebay: { label: "eBay", kind: "api", module: ebay },
  facebook_marketplace: { label: "Facebook Marketplace", kind: "browser", module: facebook },
  vinted: { label: "Vinted", kind: "browser", module: vinted },
  depop: { label: "Depop", kind: "browser", module: depop },
};

module.exports = { REGISTRY };

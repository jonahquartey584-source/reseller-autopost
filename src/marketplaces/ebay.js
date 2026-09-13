// Real posting via eBay's official Sell Inventory API (REST).
// Docs: https://developer.ebay.com/api-docs/sell/inventory/overview.html
//
// Flow per listing:
//   1. OAuth: exchange the long-lived refresh token for a short-lived
//      access token (client-credentials-with-refresh-token grant).
//   2. PUT  /sell/inventory/v1/inventory_item/{sku}     (product + photos)
//   3. POST /sell/inventory/v1/offer                    (price, policies)
//   4. POST /sell/inventory/v1/offer/{offerId}/publish   (goes live)

const REQUIRED_ENV = [
  "EBAY_CLIENT_ID",
  "EBAY_CLIENT_SECRET",
  "EBAY_REFRESH_TOKEN",
  "EBAY_MERCHANT_LOCATION_KEY",
  "EBAY_FULFILLMENT_POLICY_ID",
  "EBAY_PAYMENT_POLICY_ID",
  "EBAY_RETURN_POLICY_ID",
  "EBAY_DEFAULT_CATEGORY_ID",
];

function apiBase() {
  return process.env.EBAY_ENV === "sandbox"
    ? "https://api.sandbox.ebay.com"
    : "https://api.ebay.com";
}

function missingEnv() {
  return REQUIRED_ENV.filter((k) => !process.env[k]);
}

async function getAccessToken() {
  const basic = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${apiBase()}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.EBAY_REFRESH_TOKEN,
      scope: "https://api.ebay.com/oauth/api_scope/sell.inventory",
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `eBay OAuth failed: ${res.status} ${json.error_description || JSON.stringify(json)}`
    );
  }
  return json.access_token;
}

function conditionEnum(text = "") {
  const t = text.toLowerCase();
  if (t.includes("new") && t.includes("box")) return "NEW_WITH_BOX";
  if (t.includes("new")) return "NEW_WITHOUT_TAGS";
  if (t.includes("excellent") || t.includes("like new")) return "USED_EXCELLENT";
  if (t.includes("good")) return "USED_GOOD";
  if (t.includes("fair") || t.includes("acceptable")) return "USED_ACCEPTABLE";
  return "USED_GOOD";
}

function toPublicImageUrls(listing) {
  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!base) return [];
  return (listing.photos || []).map((filename) => `${base}/uploads/${filename}`);
}

function skuFor(listing) {
  return `RAP-${listing.id}`;
}

async function ebayFetch(path, token, options = {}) {
  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Language": "en-GB",
      Accept: "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = json.errors ? JSON.stringify(json.errors) : text;
    throw new Error(`eBay API ${path} failed: ${res.status} ${detail}`);
  }
  return json;
}

async function post(listing) {
  const missing = missingEnv();
  if (missing.length) {
    return {
      status: "error",
      message: `Missing eBay env vars: ${missing.join(", ")}`,
    };
  }

  const imageUrls = toPublicImageUrls(listing);
  if (!imageUrls.length) {
    return {
      status: "error",
      message:
        "No public image URLs available. Set PUBLIC_BASE_URL to a public https URL that serves /uploads (eBay fetches photos itself; it cannot reach 127.0.0.1).",
    };
  }

  const token = await getAccessToken();
  const sku = skuFor(listing);

  await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, token, {
    method: "PUT",
    body: JSON.stringify({
      product: {
        title: listing.name.slice(0, 80),
        description: listing.description || autoDescription(listing),
        aspects: {
          Brand: [listing.brand || "Unbranded"],
          Colour: listing.colour ? [listing.colour] : undefined,
          Size: listing.size ? [listing.size] : undefined,
        },
        imageUrls,
      },
      condition: conditionEnum(listing.condition),
      packageWeightAndSize: undefined,
      availability: {
        shipToLocationAvailability: { quantity: listing.quantity || 1 },
      },
    }),
  });

  const offerRes = await ebayFetch(`/sell/inventory/v1/offer`, token, {
    method: "POST",
    body: JSON.stringify({
      sku,
      marketplaceId: process.env.EBAY_MARKETPLACE_ID || "EBAY_GB",
      format: "FIXED_PRICE",
      availableQuantity: listing.quantity || 1,
      categoryId: process.env.EBAY_DEFAULT_CATEGORY_ID,
      listingDescription: listing.description || autoDescription(listing),
      listingPolicies: {
        fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID,
        paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID,
        returnPolicyId: process.env.EBAY_RETURN_POLICY_ID,
      },
      pricingSummary: {
        price: {
          value: String(listing.price),
          currency: listing.currency || "GBP",
        },
      },
      merchantLocationKey: process.env.EBAY_MERCHANT_LOCATION_KEY,
    }),
  });

  const offerId = offerRes.offerId;
  const publishRes = await ebayFetch(
    `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
    token,
    { method: "POST" }
  );

  const listingId = publishRes.listingId;
  return {
    status: "posted",
    externalId: listingId,
    url: listingId ? `https://www.ebay.com/itm/${listingId}` : undefined,
  };
}

function autoDescription(listing) {
  const bits = [
    listing.brand,
    listing.colour,
    listing.size ? `Size ${listing.size}` : null,
    listing.condition,
  ].filter(Boolean);
  return `${listing.name}${bits.length ? " — " + bits.join(", ") : ""}`;
}

module.exports = { post, missingEnv, conditionEnum, autoDescription };

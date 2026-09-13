// How each marketplace actually handles delivery/postage pricing.
//
// A listing carries one delivery price, but the marketplaces disagree about
// what can be done with it, so we adapt per marketplace instead of refusing
// to publish:
//
//   custom   — the seller sets a per-listing delivery price, so we fill it in.
//              (Depop)
//   policy   — postage comes from an account-level policy, not the listing, so
//              the number can't be applied per item. (eBay: the fulfillment
//              policy named by EBAY_FULFILLMENT_POLICY_ID decides postage.)
//   platform — the platform sets postage itself and the seller can't price it.
//              (Vinted: the buyer picks and pays a carrier, the seller chooses
//              parcel size. Facebook Marketplace: individual sellers are
//              collection-first, with no arbitrary postage price.)
//
// In every case the listing still publishes. Where the price can't be applied
// we attach a note saying so, rather than silently dropping it — the seller
// needs to know their £X never reached the listing.

const DELIVERY_SUPPORT = {
  depop: "custom",
  ebay: "policy",
  vinted: "platform",
  facebook_marketplace: "platform",
};

const PLATFORM_REASON = {
  vinted: "Vinted sets postage itself (the buyer picks and pays a carrier).",
  facebook_marketplace:
    "Facebook Marketplace has no per-listing postage price for individual sellers.",
  ebay: "eBay takes postage from your fulfillment policy, not the listing.",
};

function hasDeliveryPrice(listing) {
  const p = listing.deliveryPrice;
  return p !== null && p !== undefined && p !== "" && !Number.isNaN(Number(p));
}

function formatPrice(listing) {
  const symbol = { GBP: "£", USD: "$", EUR: "€" }[listing.currency] || "";
  const n = Number(listing.deliveryPrice);
  return n === 0 ? "Free delivery" : `${symbol}${n.toFixed(2)} delivery`;
}

// Returns { support, apply, value, note } for one marketplace.
// `apply` is true only when the marketplace lets us set the price on the
// listing itself; `note` is user-facing text for everything else.
function resolveDelivery(marketplace, listing) {
  const support = DELIVERY_SUPPORT[marketplace] || "platform";

  if (!hasDeliveryPrice(listing)) {
    return { support, apply: false, value: null, note: null };
  }

  if (support === "custom") {
    return {
      support,
      apply: true,
      value: Number(listing.deliveryPrice),
      note: null,
    };
  }

  const reason = PLATFORM_REASON[marketplace] || "this marketplace sets postage itself.";
  return {
    support,
    apply: false,
    value: Number(listing.deliveryPrice),
    note: `${formatPrice(listing)} not applied. ${reason}`,
  };
}

module.exports = { resolveDelivery, DELIVERY_SUPPORT, hasDeliveryPrice };

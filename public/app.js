(function () {
  const dropzone = document.getElementById("dropzone");
  const photosInput = document.getElementById("photos");
  const photoPreview = document.getElementById("photoPreview");
  const form = document.getElementById("listingForm");
  const formError = document.getElementById("formError");
  const marketplaceGrid = document.getElementById("marketplaceGrid");
  const marketplaceStatus = document.getElementById("marketplaceStatus");
  const postingTime = document.getElementById("postingTime");
  const scheduledAt = document.getElementById("scheduledAt");
  const listingsEl = document.getElementById("listings");
  const refreshBtn = document.getElementById("refreshBtn");
  const signOutBtn = document.getElementById("signOutBtn");

  let selectedFiles = [];
  let marketplaces = { live: [], comingSoon: [] };

  dropzone.addEventListener("click", () => photosInput.click());
  dropzone.addEventListener("dragover", (e) => e.preventDefault());
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });
  photosInput.addEventListener("change", () => addFiles(photosInput.files));

  function addFiles(fileList) {
    selectedFiles = [...selectedFiles, ...Array.from(fileList)].slice(0, 12);
    renderPreview();
  }

  function renderPreview() {
    photoPreview.innerHTML = "";
    selectedFiles.forEach((file) => {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      photoPreview.appendChild(img);
    });
  }

  postingTime.addEventListener("change", () => {
    scheduledAt.hidden = postingTime.value !== "schedule";
  });

  async function loadMarketplaces() {
    const res = await fetch("/api/marketplaces");
    marketplaces = await res.json();
    const liveCount = marketplaces.live.length;
    const total = liveCount + marketplaces.comingSoon.length;
    marketplaceStatus.textContent = `MARKETPLACES · ${liveCount} of ${total} live`;

    marketplaceGrid.innerHTML = "";
    marketplaces.live.forEach((m) => {
      marketplaceGrid.appendChild(marketplaceCard(m, true));
    });
    marketplaces.comingSoon.forEach((m) => {
      marketplaceGrid.appendChild(marketplaceCard(m, false));
    });
  }

  function marketplaceCard(m, enabled) {
    const card = document.createElement("div");
    card.className = "marketplace-card" + (enabled ? "" : " disabled");
    const badge = enabled
      ? `<span class="badge ${m.kind}">${m.kind === "api" ? "Official API" : "Browser automation"}</span>`
      : `<span class="badge">Coming soon</span>`;
    card.innerHTML = `
      <label>
        <input type="checkbox" name="marketplaces" value="${m.id}" ${enabled ? "" : "disabled"} />
        ${m.label} ${badge}
      </label>
      <p>${
        enabled && m.kind === "browser"
          ? "Drives your saved login session. Do a dry run before trusting it live."
          : enabled
          ? "Posts through the official API once credentials are set in .env."
          : "Not wired up in this build yet."
      }</p>
    `;
    return card;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.hidden = true;

    const checked = Array.from(form.querySelectorAll('input[name="marketplaces"]:checked')).map(
      (i) => i.value
    );
    if (!checked.length) {
      formError.textContent = "Choose at least one marketplace.";
      formError.hidden = false;
      return;
    }

    const fd = new FormData(form);
    fd.delete("marketplaces");
    checked.forEach((m) => fd.append("marketplaces", m));
    selectedFiles.forEach((f) => fd.append("photos", f));

    const res = await fetch("/api/listings", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      formError.textContent = data.error || "Something went wrong.";
      formError.hidden = false;
      return;
    }

    form.reset();
    selectedFiles = [];
    renderPreview();
    scheduledAt.hidden = true;
    await loadListings();
  });

  function statusLabel(status) {
    return (
      {
        queued: "queued",
        posting: "posting…",
        posted: "posted",
        error: "error",
        cancelled: "cancelled",
        "dry-run": "dry run",
      }[status] || status
    );
  }

  async function loadListings() {
    const res = await fetch("/api/listings");
    const listings = await res.json();
    listingsEl.innerHTML = "";

    if (!listings.length) {
      listingsEl.innerHTML = '<p class="muted">No listings yet.</p>';
      return;
    }

    listings.forEach((listing) => {
      const item = document.createElement("div");
      item.className = "listing-item";

      const thumb = listing.photos[0]
        ? `<img class="listing-thumb" src="/uploads/${listing.photos[0]}" />`
        : `<div class="listing-thumb"></div>`;

      const targets = listing.targets
        .map((t) => {
          const when = new Date(t.postAt).toLocaleString();
          const cancel =
            t.status === "queued"
              ? `<a href="#" class="cancel-link" data-id="${listing.id}" data-m="${t.marketplace}">Cancel</a>`
              : "";
          const link = t.url ? `<a href="${t.url}" target="_blank" rel="noopener">View</a>` : "";
          const message = t.message ? ` — ${escapeHtml(t.message)}` : "";
          return `<div class="target-row">
            <span class="target-status status-${t.status}"></span>
            ${t.marketplace} · ${statusLabel(t.status)} · ${when}${message}
            ${link}${cancel}
          </div>`;
        })
        .join("");

      const published = listing.targets.some((t) => t.status === "posted");

      item.innerHTML = `
        ${thumb}
        <div class="listing-body">
          <p class="listing-title">${escapeHtml(listing.name)}</p>
          <p class="listing-meta">${listing.currency} ${listing.price}${
        listing.deliveryPrice != null ? ` · Delivery ${listing.currency} ${listing.deliveryPrice}` : ""
      }${listing.brand ? ` · ${escapeHtml(listing.brand)}` : ""}${
        listing.size ? ` · ${escapeHtml(listing.size)}` : ""
      }</p>
          ${targets}
          <button class="btn btn-ghost social-btn" data-id="${listing.id}" ${published ? "" : "disabled"}>
            Choose photo &amp; create social post
          </button>
          ${!published ? '<p class="muted small">Social posting unlocks after a marketplace listing is published.</p>' : ""}
          <div class="social-caption" id="caption-${listing.id}" hidden></div>
        </div>
      `;
      listingsEl.appendChild(item);
    });

    listingsEl.querySelectorAll(".cancel-link").forEach((el) => {
      el.addEventListener("click", async (e) => {
        e.preventDefault();
        await fetch(`/api/listings/${el.dataset.id}/targets/${el.dataset.m}/cancel`, { method: "POST" });
        loadListings();
      });
    });

    listingsEl.querySelectorAll(".social-btn").forEach((el) => {
      el.addEventListener("click", async () => {
        const res = await fetch(`/api/listings/${el.dataset.id}/social-caption`, { method: "POST" });
        const data = await res.json();
        const box = document.getElementById(`caption-${el.dataset.id}`);
        box.hidden = false;
        box.textContent = data.caption || data.error;
      });
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  refreshBtn.addEventListener("click", loadListings);
  signOutBtn.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login.html";
  });

  loadMarketplaces();
  loadListings();
  setInterval(loadListings, 20000);
})();

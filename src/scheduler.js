// Polls the store for due, queued targets and posts them. Runs only while
// this process is running — like the original app, scheduled posts fire
// late (at next startup) if the app was offline when they were due,
// rather than being silently dropped.
const store = require("./store");
const { REGISTRY } = require("./marketplaces");

const TICK_MS = 15_000;

async function runOnce() {
  const listings = store.getAll();
  const now = Date.now();

  for (const listing of listings) {
    for (const target of listing.targets) {
      if (target.status !== "queued") continue;
      if (target.postAt > now) continue;

      const entry = REGISTRY[target.marketplace];
      if (!entry) {
        await store.updateTarget(listing.id, target.marketplace, (t) => {
          t.status = "error";
          t.message = "Unknown marketplace";
          t.updatedAt = Date.now();
        });
        continue;
      }

      await store.updateTarget(listing.id, target.marketplace, (t) => {
        t.status = "posting";
        t.updatedAt = Date.now();
      });

      try {
        const result = await entry.module.post(listing);
        await store.updateTarget(listing.id, target.marketplace, (t) => {
          t.status = result.status;
          t.message = result.message || null;
          t.url = result.url || t.url;
          t.externalId = result.externalId || t.externalId;
          t.updatedAt = Date.now();
        });
      } catch (err) {
        await store.updateTarget(listing.id, target.marketplace, (t) => {
          t.status = "error";
          t.message = err.message;
          t.updatedAt = Date.now();
        });
      }
    }
  }
}

function start() {
  runOnce().catch((err) => console.error("[scheduler] tick failed", err));
  const timer = setInterval(() => {
    runOnce().catch((err) => console.error("[scheduler] tick failed", err));
  }, TICK_MS);
  timer.unref();
  return timer;
}

module.exports = { start, runOnce };

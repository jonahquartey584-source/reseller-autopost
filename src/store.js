// Tiny JSON-file-backed store for listings. Good enough for a single local
// user; not meant to survive concurrent multi-process writers.
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "listings.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, "[]");
}

function load() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return [];
  }
}

// Serialize writes so the scheduler tick and an incoming API request never
// interleave a read-modify-write and clobber each other.
let writeChain = Promise.resolve();
function save(listings) {
  writeChain = writeChain.then(
    () =>
      new Promise((resolve, reject) => {
        const tmp = FILE + ".tmp";
        fs.writeFile(tmp, JSON.stringify(listings, null, 2), (err) => {
          if (err) return reject(err);
          fs.rename(tmp, FILE, (err2) => (err2 ? reject(err2) : resolve()));
        });
      })
  );
  return writeChain;
}

function getAll() {
  return load();
}

function getById(id) {
  return load().find((l) => l.id === id) || null;
}

async function add(listing) {
  const listings = load();
  listings.unshift(listing);
  await save(listings);
  return listing;
}

async function update(id, mutate) {
  const listings = load();
  const idx = listings.findIndex((l) => l.id === id);
  if (idx === -1) return null;
  mutate(listings[idx]);
  await save(listings);
  return listings[idx];
}

async function updateTarget(id, marketplace, mutate) {
  return update(id, (listing) => {
    const target = listing.targets.find((t) => t.marketplace === marketplace);
    if (target) mutate(target);
  });
}

module.exports = { getAll, getById, add, update, updateTarget };

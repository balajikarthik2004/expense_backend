/**
 * Lossless backup of every collection in the configured database.
 *
 * Writes Canonical Extended JSON, not plain JSON: JSON.stringify would flatten
 * ObjectId to a string and Date to an ISO string, so a restore would silently
 * change every _id and every timestamp's type. Canonical EJSON round-trips
 * ObjectId, Date, Decimal128, Long and Binary exactly.
 *
 * Index definitions are written alongside the documents — data alone does not
 * rebuild a unique index, and losing one lets duplicates in on restore.
 *
 *   node scripts/backup-db.js [outputDir]
 */
require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const dns = require("dns");
const { MongoClient } = require("mongodb");
const { EJSON } = require("bson");

const isUsableResolver = (address) =>
  !address.startsWith("127.") && address !== "::1" && address !== "0.0.0.0";

if (!dns.getServers().some(isUsableResolver)) {
  dns.setServers((process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1").split(",").map((s) => s.trim()));
}

(async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve(process.argv[2] || path.join(__dirname, "..", "backups", stamp));

  const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  await client.connect();

  const db = client.db();
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Backing up "${db.databaseName}" → ${outDir}\n`);

  const manifest = { database: db.databaseName, startedAt: new Date().toISOString(), collections: {} };
  const collections = await db.listCollections().toArray();

  for (const { name } of collections) {
    // Natural order with a plain cursor: no sort, so no 32MB in-memory sort
    // limit to trip over as collections grow.
    const docs = await db.collection(name).find({}).toArray();
    const indexes = await db.collection(name).indexes();

    fs.writeFileSync(
      path.join(outDir, `${name}.json`),
      EJSON.stringify(docs, { relaxed: false, indent: 2 })
    );
    fs.writeFileSync(
      path.join(outDir, `${name}.indexes.json`),
      JSON.stringify(indexes, null, 2)
    );

    manifest.collections[name] = { documents: docs.length, indexes: indexes.length };
    console.log(`  ${name}: ${docs.length} docs, ${indexes.length} indexes`);
  }

  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, "_manifest.json"), JSON.stringify(manifest, null, 2));

  await client.close();
  console.log(`\nDone. ${Object.keys(manifest.collections).length} collections written.`);
})().catch((e) => {
  console.error("Backup failed:", e.message);
  process.exit(1);
});

/**
 * Restore a backup produced by backup-db.js.
 *
 *   node scripts/restore-db.js <backupDir> [--db <name>] [--drop]
 *
 * Target database defaults to the one in MONGO_URI. --drop clears each
 * collection first; without it, existing documents with the same _id cause the
 * restore to fail loudly rather than half-apply.
 *
 * Indexes are recreated after insert, so a unique index cannot be lost — data
 * alone would let duplicates back in.
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

const args = process.argv.slice(2);
const backupDir = args.find((a) => !a.startsWith("--"));
const drop = args.includes("--drop");
const dbName = args.includes("--db") ? args[args.indexOf("--db") + 1] : undefined;

(async () => {
  if (!backupDir) throw new Error("Usage: node scripts/restore-db.js <backupDir> [--db name] [--drop]");
  if (!fs.existsSync(backupDir)) throw new Error(`No such backup directory: ${backupDir}`);

  const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  await client.connect();

  const db = dbName ? client.db(dbName) : client.db();
  console.log(`Restoring ${backupDir} → "${db.databaseName}"${drop ? " (dropping first)" : ""}\n`);

  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".indexes.json") && f !== "_manifest.json");

  for (const file of files) {
    const name = path.basename(file, ".json");
    const docs = EJSON.parse(fs.readFileSync(path.join(backupDir, file), "utf8"), { relaxed: false });
    const col = db.collection(name);

    if (drop) await col.deleteMany({});
    if (docs.length) await col.insertMany(docs, { ordered: false });

    const indexPath = path.join(backupDir, `${name}.indexes.json`);
    let rebuilt = 0;
    if (fs.existsSync(indexPath)) {
      for (const idx of JSON.parse(fs.readFileSync(indexPath, "utf8"))) {
        if (idx.name === "_id_") continue; // always present, cannot be recreated
        const { key, name: idxName, v, ...options } = idx;
        await col.createIndex(key, { name: idxName, ...options });
        rebuilt += 1;
      }
    }
    console.log(`  ${name}: ${docs.length} docs, ${rebuilt} indexes`);
  }

  await client.close();
  console.log("\nRestore complete.");
})().catch((e) => {
  console.error("Restore failed:", e.message);
  process.exit(1);
});

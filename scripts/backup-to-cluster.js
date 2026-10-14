/**
 * Weekly verified snapshot: source cluster -> backup cluster.
 *
 *   node scripts/backup-to-cluster.js [--id <snapshotId>] [--keep <n>] [--dry-run]
 *
 * Each run writes a COMPLETE copy into its own database on the backup cluster,
 * named snap_<YYYY_MM_DD>. Older snapshots are left untouched, so the backup
 * cluster accumulates history: this week's data sits alongside last week's.
 *
 * Why full copies rather than appending into one shared database: an append
 * would carry forward a document that was deleted or corrupted upstream, and
 * you could never recover the state as it stood on a given date. Independent
 * snapshots let you restore any past week exactly. At ~200KB per run this
 * costs a few MB a year against M0's 512MB.
 *
 * Every snapshot is verified before it counts as successful. A failed
 * verification leaves the snapshot in place marked `verified: false` so it can
 * be inspected, skips pruning, and exits non-zero so the scheduler reports a
 * failure instead of silently losing a week.
 */
require("dotenv").config({ quiet: true });

const crypto = require("crypto");
const { MongoClient } = require("mongodb");
const { EJSON } = require("bson");
const ensureDns = require("../utils/ensureDns");

ensureDns({ quiet: true });

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const dryRun = args.includes("--dry-run");

const REGISTRY_DB = "backup_registry";
const SNAPSHOT_PREFIX = "snap_";
const BATCH = 1000;

// M0 free tier: 512MB storage. Warn well before it bites, because Atlas starts
// refusing writes rather than degrading gracefully.
const M0_STORAGE_BYTES = 512 * 1024 * 1024;
const WARN_AT = 0.8;

/**
 * Order-independent checksum over a collection.
 *
 * Each document is hashed as Canonical Extended JSON (which encodes ObjectId,
 * Date and Decimal128 distinctly, so a silent type change alters the hash),
 * and the per-document hashes are XORed together. XOR means we never hold every
 * document in memory and never need a sort, so this behaves the same on 500
 * documents or 5 million.
 */
const makeChecksum = () => {
  const acc = Buffer.alloc(32);
  return {
    add(doc) {
      const h = crypto
        .createHash("sha256")
        .update(EJSON.stringify(doc, { relaxed: false }))
        .digest();
      for (let i = 0; i < 32; i += 1) acc[i] ^= h[i];
    },
    digest: () => acc.toString("hex"),
  };
};

const scanCollection = async (collection) => {
  const checksum = makeChecksum();
  let count = 0;
  const cursor = collection.find({}, { batchSize: BATCH });
  for await (const doc of cursor) {
    checksum.add(doc);
    count += 1;
  }
  return { count, checksum: checksum.digest() };
};

const copyCollection = async (source, target) => {
  const checksum = makeChecksum();
  let count = 0;
  let buffer = [];

  const cursor = source.find({}, { batchSize: BATCH });
  for await (const doc of cursor) {
    checksum.add(doc);
    buffer.push(doc);
    count += 1;
    if (buffer.length >= BATCH) {
      await target.insertMany(buffer, { ordered: false });
      buffer = [];
    }
  }
  if (buffer.length) await target.insertMany(buffer, { ordered: false });

  return { count, checksum: checksum.digest() };
};

const copyIndexes = async (source, target) => {
  const indexes = await source.indexes();
  let built = 0;
  for (const index of indexes) {
    if (index.name === "_id_") continue; // implicit, cannot be created
    const { key, name, v, ...options } = index;
    await target.createIndex(key, { name, ...options });
    built += 1;
  }
  return built;
};

(async () => {
  const sourceUri = process.env.MONGO_URI;
  const backupUri = process.env.BACKUP_MONGO_URI;

  if (!sourceUri) throw new Error("MONGO_URI is not set");
  if (!backupUri) {
    throw new Error(
      "BACKUP_MONGO_URI is not set - add the backup cluster's connection string to .env"
    );
  }
  if (sourceUri === backupUri) {
    throw new Error(
      "BACKUP_MONGO_URI is identical to MONGO_URI - a backup must target a different cluster"
    );
  }

  const snapshotId = flag("id", new Date().toISOString().slice(0, 10)).replace(/-/g, "_");
  const keep = Number(flag("keep", process.env.BACKUP_KEEP || 12));
  const snapshotDbName = SNAPSHOT_PREFIX + snapshotId;

  const sourceClient = new MongoClient(sourceUri, { serverSelectionTimeoutMS: 30000 });
  const backupClient = new MongoClient(backupUri, { serverSelectionTimeoutMS: 30000 });
  await Promise.all([sourceClient.connect(), backupClient.connect()]);

  const sourceDb = sourceClient.db();
  const snapshotDb = backupClient.db(snapshotDbName);
  const registry = backupClient.db(REGISTRY_DB).collection("snapshots");

  const started = new Date();
  console.log("Snapshot " + snapshotId);
  console.log("  source: " + sourceDb.databaseName + " @ " + sourceClient.options.hosts[0].host);
  console.log("  target: " + snapshotDbName + " @ " + backupClient.options.hosts[0].host);
  console.log(dryRun ? "  (dry run - nothing will be written)\n" : "");

  const collections = (await sourceDb.listCollections().toArray()).map((c) => c.name);
  const report = {};
  let failed = false;

  for (const name of collections) {
    const source = sourceDb.collection(name);

    if (dryRun) {
      const scanned = await scanCollection(source);
      report[name] = { documents: scanned.count, checksum: scanned.checksum };
      console.log(
        "  " + name.padEnd(12) + String(scanned.count).padStart(6) + " docs  " +
          scanned.checksum.slice(0, 16)
      );
      continue;
    }

    // Re-running the same snapshot id replaces it rather than doubling it up,
    // so retrying after a partial failure is safe.
    const target = snapshotDb.collection(name);
    await target.deleteMany({});

    const written = await copyCollection(source, target);
    const indexes = await copyIndexes(source, target);

    // Verify by re-reading what actually landed on the backup cluster. Trusting
    // the write result would miss a document altered or rejected in transit.
    const stored = await scanCollection(target);
    const verified = stored.count === written.count && stored.checksum === written.checksum;
    if (!verified) failed = true;

    report[name] = {
      documents: written.count,
      indexes,
      checksum: written.checksum,
      storedChecksum: stored.checksum,
      verified,
    };

    console.log(
      "  " + (verified ? "OK  " : "FAIL") + " " + name.padEnd(12) +
        String(written.count).padStart(6) + " docs, " + indexes + " idx  " +
        written.checksum.slice(0, 16)
    );
  }

  if (dryRun) {
    await Promise.all([sourceClient.close(), backupClient.close()]);
    console.log("\nDry run complete - no data written.");
    return;
  }

  const totalDocs = Object.values(report).reduce((sum, r) => sum + r.documents, 0);
  await registry.replaceOne(
    { _id: snapshotId },
    {
      _id: snapshotId,
      database: snapshotDbName,
      sourceDatabase: sourceDb.databaseName,
      startedAt: started,
      finishedAt: new Date(),
      verified: !failed,
      totalDocuments: totalDocs,
      collections: report,
    },
    { upsert: true }
  );

  // Retention: keep the most recent N snapshots, drop the rest. Done only after
  // the new snapshot is written AND verified - pruning first would risk
  // deleting the last good copy if this run then failed.
  const allSnapshots = (await backupClient.db().admin().listDatabases()).databases
    .map((d) => d.name)
    .filter((n) => n.startsWith(SNAPSHOT_PREFIX))
    .sort();

  const toDrop = failed ? [] : allSnapshots.slice(0, Math.max(0, allSnapshots.length - keep));
  for (const name of toDrop) {
    await backupClient.db(name).dropDatabase();
    await registry.updateOne({ database: name }, { $set: { pruned: true, prunedAt: new Date() } });
    console.log("  pruned " + name);
  }

  const listing = await backupClient.db().admin().listDatabases();
  const used = listing.totalSize || 0;
  const pct = used / M0_STORAGE_BYTES;
  console.log(
    "\nBackup cluster: " + (used / 1024 / 1024).toFixed(1) + " MB of 512 MB used (" +
      (pct * 100).toFixed(1) + "%), " + (allSnapshots.length - toDrop.length) + " snapshots retained"
  );
  if (pct > WARN_AT) {
    console.warn("WARNING: over " + WARN_AT * 100 + "% of the M0 limit - lower BACKUP_KEEP or upgrade tier.");
  }

  await Promise.all([sourceClient.close(), backupClient.close()]);

  if (failed) {
    console.error("\nFAILED: snapshot " + snapshotId + " did not verify - kept for inspection, not pruned.");
    process.exit(1);
  }
  console.log(
    "\nOK: snapshot " + snapshotId + " verified - " + totalDocs + " documents across " +
      collections.length + " collections."
  );
})().catch((e) => {
  console.error("Backup failed:", e.message);
  process.exit(1);
});

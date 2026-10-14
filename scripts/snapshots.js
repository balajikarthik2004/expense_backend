/**
 * Inspect and restore the weekly snapshots on the backup cluster.
 *
 *   node scripts/snapshots.js list
 *   node scripts/snapshots.js verify <snapshotId>
 *   node scripts/snapshots.js restore <snapshotId> --into <dbName> [--yes]
 *
 * `restore` deliberately requires --into. Restoring straight over the live
 * database is how a bad restore turns a recoverable incident into data loss;
 * restore into a scratch database, check it, then repoint the app.
 */
require("dotenv").config({ quiet: true });

const crypto = require("crypto");
const { MongoClient } = require("mongodb");
const { EJSON } = require("bson");
const ensureDns = require("../utils/ensureDns");

ensureDns({ quiet: true });

const args = process.argv.slice(2);
const command = args[0];
const target = args[1];
const flag = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const REGISTRY_DB = "backup_registry";
const SNAPSHOT_PREFIX = "snap_";
const BATCH = 1000;

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
  for await (const doc of collection.find({}, { batchSize: BATCH })) {
    checksum.add(doc);
    count += 1;
  }
  return { count, checksum: checksum.digest() };
};

const normalizeId = (id) => String(id).replace(/-/g, "_");

(async () => {
  if (!process.env.BACKUP_MONGO_URI) {
    throw new Error("BACKUP_MONGO_URI is not set - add the backup cluster's connection string to .env");
  }

  const client = new MongoClient(process.env.BACKUP_MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  await client.connect();
  const registry = client.db(REGISTRY_DB).collection("snapshots");

  if (command === "list" || !command) {
    const rows = await registry.find({ pruned: { $ne: true } }).sort({ _id: 1 }).toArray();
    if (!rows.length) {
      console.log("No snapshots on the backup cluster yet.");
    } else {
      console.log("SNAPSHOT      DOCS   VERIFIED  TAKEN");
      for (const r of rows) {
        console.log(
          r._id.padEnd(13) +
            String(r.totalDocuments).padStart(5) + "   " +
            (r.verified ? "yes     " : "NO      ") + "  " +
            new Date(r.finishedAt).toISOString().replace("T", " ").slice(0, 16)
        );
      }
      const listing = await client.db().admin().listDatabases();
      console.log(
        "\n" + rows.length + " snapshots, " +
          ((listing.totalSize || 0) / 1024 / 1024).toFixed(1) + " MB of 512 MB used."
      );
    }
    await client.close();
    return;
  }

  if (!target) throw new Error("Usage: node scripts/snapshots.js " + command + " <snapshotId>");
  const id = normalizeId(target);
  const record = await registry.findOne({ _id: id });
  if (!record) throw new Error("No snapshot " + id + " in the registry. Run `list` to see what exists.");
  if (record.pruned) throw new Error("Snapshot " + id + " was pruned by the retention policy.");

  const snapshotDb = client.db(SNAPSHOT_PREFIX + id);

  if (command === "verify") {
    // Re-check the stored copy against the checksums recorded when it was
    // taken. This catches drift in the backup itself, which a count alone
    // would not: same number of documents, different contents.
    let ok = true;
    for (const [name, meta] of Object.entries(record.collections)) {
      const stored = await scanCollection(snapshotDb.collection(name));
      const match = stored.count === meta.documents && stored.checksum === meta.checksum;
      if (!match) ok = false;
      console.log(
        (match ? "OK   " : "DRIFT") + " " + name.padEnd(12) +
          stored.count + "/" + meta.documents + " docs"
      );
    }
    await client.close();
    console.log(ok ? "\nSnapshot " + id + " intact." : "\nSnapshot " + id + " HAS DRIFTED.");
    process.exit(ok ? 0 : 1);
  }

  if (command === "restore") {
    const into = flag("into");
    if (!into) {
      throw new Error(
        "restore requires --into <dbName>. Restore into a scratch database, verify it, " +
          "then repoint MONGO_URI - do not overwrite the live database blind."
      );
    }
    if (!args.includes("--yes")) {
      console.log("About to restore snapshot " + id + " into database \"" + into + "\".");
      console.log("Existing collections in \"" + into + "\" with the same names will be cleared.");
      console.log("Re-run with --yes to proceed.");
      await client.close();
      return;
    }

    // Restore target lives on whichever cluster RESTORE_MONGO_URI names,
    // defaulting to the live cluster so the usual case needs no extra config.
    const restoreUri = process.env.RESTORE_MONGO_URI || process.env.MONGO_URI;
    const restoreClient = new MongoClient(restoreUri, { serverSelectionTimeoutMS: 30000 });
    await restoreClient.connect();
    const destination = restoreClient.db(into);

    console.log("Restoring " + id + " -> " + into + " @ " + restoreClient.options.hosts[0].host + "\n");
    let ok = true;

    for (const [name, meta] of Object.entries(record.collections)) {
      const source = snapshotDb.collection(name);
      const dest = destination.collection(name);
      await dest.deleteMany({});

      let buffer = [];
      let count = 0;
      for await (const doc of source.find({}, { batchSize: BATCH })) {
        buffer.push(doc);
        count += 1;
        if (buffer.length >= BATCH) {
          await dest.insertMany(buffer, { ordered: false });
          buffer = [];
        }
      }
      if (buffer.length) await dest.insertMany(buffer, { ordered: false });

      for (const index of await source.indexes()) {
        if (index.name === "_id_") continue;
        const { key, name: idxName, v, ...options } = index;
        await dest.createIndex(key, { name: idxName, ...options });
      }

      const stored = await scanCollection(dest);
      const match = stored.count === meta.documents && stored.checksum === meta.checksum;
      if (!match) ok = false;
      console.log(
        "  " + (match ? "OK  " : "FAIL") + " " + name.padEnd(12) + count + " docs"
      );
    }

    await Promise.all([client.close(), restoreClient.close()]);
    console.log(
      ok
        ? "\nRestore verified against the snapshot's original checksums."
        : "\nRESTORE DID NOT VERIFY - do not repoint the app at this database."
    );
    process.exit(ok ? 0 : 1);
  }

  await client.close();
  throw new Error("Unknown command \"" + command + "\". Use list, verify or restore.");
})().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});

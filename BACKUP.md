# Backups

Weekly verified snapshots from the live Atlas cluster to a second Atlas cluster.
Each week lands in its own database, so history accumulates rather than being
overwritten.

## How it works

```
live cluster                 backup cluster
  test            ──weekly──>   snap_2026_10_05   (week 1)
                                snap_2026_10_12   (week 2)
                                snap_2026_10_19   (week 3, newest)
                                backup_registry   (what was taken, when, checksums)
```

Every run copies **all** collections and their index definitions into a fresh
`snap_<YYYY_MM_DD>` database. Old snapshots are never modified. Once
`BACKUP_KEEP` snapshots exist (default 12, about three months), the oldest is
dropped.

**Why full copies rather than appending into one database.** Appending would
carry a deleted or corrupted document forward forever, and you could never
recover the state as it stood on a given date. Independent snapshots let you
restore any retained week exactly. At ~200 KB per snapshot, 12 weeks costs about
2.4 MB of the 512 MB free tier.

## "Without any loss" — what actually guarantees that

Three things, in order of what they catch:

1. **Canonical Extended JSON for checksums.** `ObjectId`, `Date` and
   `Decimal128` are encoded distinctly, so a value that silently changes *type*
   in transit alters the checksum. Plain JSON would flatten an `ObjectId` to a
   string and compare equal.
2. **Read-back verification.** After writing, the script re-reads what actually
   landed on the backup cluster and compares document count and checksum against
   the source. The write acknowledgement alone is not evidence.
3. **Index definitions are copied too.** Documents alone do not rebuild the
   unique index on `users.email` — restoring without it would let duplicate
   accounts in.

A snapshot that fails verification is **kept** (marked `verified: false`),
**not pruned**, and the process exits non-zero so the scheduler reports a
failure rather than quietly losing a week.

## One-time setup

### 1. Create the backup cluster

Atlas allows only **one free M0 cluster per project**, so the backup needs its
own project — not just another cluster in the existing one.

1. Atlas → project dropdown (top left) → **New Project** → name it
   e.g. `expense-backup` → Create.
2. **Create** → **M0 FREE** → pick a region → name it `backup0` → Create.
3. **Database Access** → Add New Database User → name + password →
   role **Read and write to any database**.
4. **Network Access** → Add IP Address:
   - GitHub Actions: **Allow access from anywhere** (`0.0.0.0/0`). Runner IPs
     are not fixed, so there is no narrower option. The user above is scoped to
     this backup project only, which limits the blast radius.
   - Windows Task Scheduler: add your own IP instead.
5. **Connect** → **Drivers** → copy the connection string.

### 2. Configure

Put the string in `.env`:

```
BACKUP_MONGO_URI=mongodb+srv://<user>:<pass>@backup0.xxxxx.mongodb.net/?retryWrites=true&w=majority
BACKUP_KEEP=12
```

Check it before scheduling anything:

```bash
npm run backup:dry    # reads and checksums the source, writes nothing
npm run backup        # real snapshot
npm run snapshots     # list what is stored
```

### 3. Schedule it

**GitHub Actions** (recommended — runs whether or not your laptop is on).
`.github/workflows/weekly-backup.yml` is ready. Add two repository secrets under
Settings → Secrets and variables → Actions:

- `MONGO_URI` — the live cluster string
- `BACKUP_MONGO_URI` — the backup cluster string

Then trigger one run by hand from the Actions tab to confirm it works. A failed
verification fails the job, which emails you.

**Windows Task Scheduler** (if the project is not on GitHub):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-weekly-backup.ps1
Start-ScheduledTask -TaskName ExpenseWeeklyMongoBackup   # test it now
```

Output goes to `backups\weekly-backup.log`. This only runs when the machine is
on; `-StartWhenAvailable` catches up a missed window once it is back, but a
laptop off for a fortnight misses those weeks.

## Day-to-day

```bash
npm run snapshots                                  # list snapshots
npm run snapshots -- verify 2026-10-05             # re-check one against its checksums
npm run snapshots -- restore 2026-10-05 --into recovered --yes
npm run backup:local                               # extra copy to local disk
```

`restore` requires `--into <dbName>` and will not overwrite the live database
directly. Restore into a scratch database, check it, then repoint `MONGO_URI`.
That ordering is what stops a bad restore turning a recoverable incident into
data loss.

## Limits worth knowing

- **Same provider.** Both clusters are Atlas. This protects against application
  bugs, bad migrations and accidental deletes — not against losing the Atlas
  account itself. `npm run backup:local` covers that; keep a copy off-machine.
- **Not a consistent snapshot.** Collections are read sequentially, so writes
  landing mid-run can leave `expenses` fractionally ahead of `users`. Fine for a
  weekly backup of this app. Atlas Cloud Backup (M10+) is the consistent option.
- **M0 pauses after 60 days idle.** A weekly backup keeps it active, so this
  only bites if backups stop — and then you would want to notice anyway.
- **512 MB ceiling.** The script prints usage each run and warns past 80%.
- **Backup files contain real user data**, including bcrypt password hashes.
  `backups/` is gitignored; keep it that way.

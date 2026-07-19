const path = require('node:path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'receptionist.db');
const DRY_RUN = process.argv.includes('--dry-run');

function normalizePhone(rawPhone) {
  const trimmed = String(rawPhone || '').trim();
  const digits = trimmed.replace(/\D/g, '');

  if (!digits) return trimmed;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.startsWith('00') && digits.length > 2) return `+${digits.slice(2)}`;
  if (trimmed.startsWith('+')) return `+${digits}`;
  return digits.length < 7 ? trimmed : `+${digits}`;
}

function byCreatedAtThenId(a, b) {
  const ta = Date.parse(a.created_at || '') || 0;
  const tb = Date.parse(b.created_at || '') || 0;
  if (ta !== tb) return ta - tb;
  return String(a.id).localeCompare(String(b.id));
}

function run() {
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  const customers = db
    .prepare('select id, phone, created_at from customers order by created_at asc, id asc')
    .all();

  const groups = new Map();
  for (const c of customers) {
    const normalized = normalizePhone(c.phone);
    if (!groups.has(normalized)) groups.set(normalized, []);
    groups.get(normalized).push(c);
  }

  const updates = [];
  const dedupePlans = [];

  for (const [normalizedPhone, rows] of groups.entries()) {
    rows.sort(byCreatedAtThenId);
    const keeper = rows[0];

    if (keeper && keeper.phone !== normalizedPhone) {
      updates.push({ id: keeper.id, oldPhone: keeper.phone, newPhone: normalizedPhone });
    }

    if (rows.length > 1) {
      const duplicates = rows.slice(1).map((r) => r.id);
      dedupePlans.push({ keeperId: keeper.id, normalizedPhone, duplicateIds: duplicates });
      for (const dup of rows.slice(1)) {
        if (dup.phone !== normalizedPhone) {
          updates.push({ id: dup.id, oldPhone: dup.phone, newPhone: normalizedPhone });
        }
      }
    }
  }

  const stats = {
    customersScanned: customers.length,
    phoneUpdates: updates.length,
    dedupeGroups: dedupePlans.length,
    duplicateCustomersMerged: dedupePlans.reduce((sum, p) => sum + p.duplicateIds.length, 0),
  };

  console.log(JSON.stringify({ dbPath: DB_PATH, dryRun: DRY_RUN, stats }, null, 2));

  if (DRY_RUN) {
    if (updates.length > 0) {
      console.log('Planned phone updates:');
      for (const u of updates.slice(0, 25)) {
        console.log(`- ${u.id}: "${u.oldPhone}" -> "${u.newPhone}"`);
      }
      if (updates.length > 25) {
        console.log(`... ${updates.length - 25} more`);
      }
    }
    if (dedupePlans.length > 0) {
      console.log('Planned duplicate merges:');
      for (const p of dedupePlans.slice(0, 25)) {
        console.log(`- keep ${p.keeperId}, merge [${p.duplicateIds.join(', ')}] as ${p.normalizedPhone}`);
      }
      if (dedupePlans.length > 25) {
        console.log(`... ${dedupePlans.length - 25} more`);
      }
    }
    db.close();
    return;
  }

  const updateCustomerPhone = db.prepare('update customers set phone = @phone, updated_at = @updatedAt where id = @id');

  const reassignStatements = [
    db.prepare('update vehicles set customer_id = ? where customer_id = ?'),
    db.prepare('update calls set customer_id = ? where customer_id = ?'),
    db.prepare('update appointment_requests set customer_id = ? where customer_id = ?'),
    db.prepare('update appointments set customer_id = ? where customer_id = ?'),
    db.prepare('update callback_tasks set customer_id = ? where customer_id = ?'),
    db.prepare('update service_locations set customer_id = ? where customer_id = ?'),
  ];

  const deleteCustomer = db.prepare('delete from customers where id = ?');
  const now = new Date().toISOString();

  const txn = db.transaction(() => {
    for (const plan of dedupePlans) {
      for (const duplicateId of plan.duplicateIds) {
        for (const stmt of reassignStatements) {
          stmt.run(plan.keeperId, duplicateId);
        }
        deleteCustomer.run(duplicateId);
      }
    }

    for (const [normalizedPhone, rows] of groups.entries()) {
      rows.sort(byCreatedAtThenId);
      const keeper = rows[0];
      if (keeper && keeper.phone !== normalizedPhone) {
        updateCustomerPhone.run({ id: keeper.id, phone: normalizedPhone, updatedAt: now });
      }
    }
  });

  txn();
  db.close();
  console.log('Phone normalization migration completed.');
}

try {
  run();
} catch (err) {
  console.error('Migration failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
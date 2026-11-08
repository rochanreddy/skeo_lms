// Bring the Library in line with utils/librarySeed.js now, without waiting for
// a restart: the server applies the same list on every start anyway.
//   npm run seed:library
import 'dotenv/config';
import { connectDb } from '../db.js';
import { syncLibrary, LIBRARY_ITEMS } from '../utils/librarySeed.js';

async function run() {
  await connectDb();
  const r = await syncLibrary();
  if (!r.changed) console.log('✓ Library already up to date');
  else console.log(`✓ cleared ${r.removed} old seeded items, seeded ${r.added}`);
  const byCat = LIBRARY_ITEMS.reduce((a, d) => ((a[d.category] = (a[d.category] || 0) + 1), a), {});
  console.log('  by category:', JSON.stringify(byCat));
  process.exit(0);
}

run().catch((err) => { console.error('Library seed failed:', err); process.exit(1); });

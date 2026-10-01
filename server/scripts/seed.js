// Seed a first LMS admin.  Run:  npm run seed
import 'dotenv/config';
import { hashPassword } from '../utils/password.js';
import { connectDb } from '../db.js';
import { User } from '../models/User.js';
import { Program } from '../models/Program.js';

const ADMIN_EMAIL = process.env.SKEO_SEED_EMAIL || 'admin@skeo.in';
const ADMIN_PASSWORD = process.env.SKEO_SEED_PASSWORD || 'ChangeMe123!';

async function run() {
  await connectDb();

  let admin = await User.findOne({ email: ADMIN_EMAIL });
  if (!admin) {
    admin = await User.create({
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      fullName: 'skeo Admin',
      role: 'admin',
      emailVerified: true,
    });
    console.log(`✓ Created admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } else {
    console.log(`• Admin already exists: ${ADMIN_EMAIL}`);
  }

  // The course itself — the Claude programme — comes from seed:claude.
  if ((await Program.countDocuments()) === 0) {
    console.log('• No programme yet: run `npm run seed:claude -- --write` to create the Claude course.');
  }

  console.log('\nDone. Change the admin password after first login.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

// Seeds N student accounts into the load-test database. All of them share one
// password, so the bcrypt hash is computed once instead of N times.
import 'dotenv/config';
import mongoose from 'mongoose';
import { hashPassword } from '../utils/password.js';
import { User } from '../models/User.js';

const N = Number(process.env.LOAD_USERS || 120);
const PASSWORD = process.env.LOAD_PASSWORD || 'LoadTest123!';

await mongoose.connect(process.env.MONGODB_URI);
console.log('seeding into →', mongoose.connection.name);

const t0 = Date.now();
const passwordHash = await hashPassword(PASSWORD);
console.log(`one hash = ${Date.now() - t0}ms`);

await User.deleteMany({ email: /^load\d+@skeo\.test$/ });
await User.insertMany(
  Array.from({ length: N }, (_, i) => ({
    email: `load${i}@skeo.test`,
    passwordHash,
    fullName: `Load User ${i}`,
    role: 'student',
  })),
);
console.log(`seeded ${N} students`);
await mongoose.disconnect();

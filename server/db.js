import mongoose from 'mongoose';

// Connects to the SAME MongoDB Atlas cluster as the marketing site, using the
// same MONGODB_URI. This service only ever reads/writes lms_* collections
// (enforced by the explicit collection names in server/models/*), so it never
// collides with the marketing data (leads, orders, users).
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/meridian';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUri);
  console.log('LMS DB connected →', mongoose.connection.name);
}

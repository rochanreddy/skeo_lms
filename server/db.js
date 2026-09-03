import mongoose from 'mongoose';

// Own dedicated Atlas cluster (project: Sachin's Org / Project 0), database
// "skeo". Every model pins an explicit skeo_* collection name (see
// server/models/*), so this stays self-contained even if the URI is ever
// pointed at a cluster shared with something else.
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skeo';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUri);
  console.log('LMS DB connected →', mongoose.connection.name);
}

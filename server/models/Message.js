import mongoose from 'mongoose';

// A message in a batch's general group chat (admins + students).
const messageSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

export const Message = mongoose.model('Message', messageSchema, 'skeo_messages');

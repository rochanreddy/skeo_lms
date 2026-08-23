import mongoose from 'mongoose';

// A downloadable resource in the Library (PPT, eBook, note, etc.). Global —
// visible to all students. Admins add them (by link for now).
const libraryItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, enum: ['PPT', 'eBook', 'Note', 'Library'], default: 'Note', index: true },
    url: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  { timestamps: true },
);

export const LibraryItem = mongoose.model('LibraryItem', libraryItemSchema, 'skeo_library');

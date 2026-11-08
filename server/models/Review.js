import mongoose from 'mongoose';

// A student's review of the programme. One per student: submitting again
// replaces their answers rather than adding a second review.
//
// Each answer carries a copy of the question as it read when answered, so
// the admin view still makes sense after the questions in config/reviews.js
// change.
const answerSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    question: { type: String, default: '' },
    type: { type: String, default: 'text' },
    value: { type: mongoose.Schema.Types.Mixed, default: null }, // number or string
  },
  { _id: false },
);

const reviewSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    answers: { type: [answerSchema], default: [] },
  },
  { timestamps: true },
);

reviewSchema.index({ updatedAt: -1 });

export const Review = mongoose.model('Review', reviewSchema, 'skeo_reviews');

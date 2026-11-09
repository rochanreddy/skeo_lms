// The student review form: its questions, and where to send a happy student
// afterwards. Edit this file to change the form; nothing else needs touching.
//
// Each question:
//   id        stable key the answer is stored under. Don't rename one that has
//             answers, or old answers lose their question in the admin view.
//   label     what the student reads
//   type      'rating' (1 to 5 stars), 'scale' (0 to 10), 'choice' (pick one
//             of `options`) or 'text' (free text; `long: true` for a box)
//   required  must be answered to submit
//
//   placeholder  hint text inside a text box
//   max          longest answer a text box accepts (characters)
//
// Worded for any course, not one in particular: a student leaves one review
// for the course they are on. New ids rather than reworded old ones, so the
// reviews left on the earlier class-session form keep their own questions.
export const REVIEW_INTRO = {
  title: 'How’s your course going?',
  note: 'Rate each from 1 (low) to 5 (high). It takes under a minute.',
};

export const REVIEW_QUESTIONS = [
  { id: 'overall', label: 'Overall, how would you rate this course so far?', type: 'rating', required: true },
  { id: 'lessons', label: 'How clear are the lessons and notes?', type: 'rating', required: true },
  { id: 'practice', label: 'How useful are the assignments, projects and quizzes for learning by doing?', type: 'rating', required: true },
  { id: 'confidence', label: 'How confident do you feel using what you’ve learned in your own work?', type: 'rating', required: true },
  { id: 'platform', label: 'How easy is skeo to use: watching lessons, submitting work, checking grades?', type: 'rating', required: true },
  {
    id: 'comment',
    label: 'What’s worked best for you, and what should we improve?',
    type: 'text',
    long: true,
    required: false,
    max: 2000,
    placeholder: 'A lesson that clicked, something confusing, a topic you’d like added…',
  },
];

// Shown after a review is submitted, inviting a public review. Leave one
// empty and its button simply doesn't appear. The environment wins, so the
// live links can be set on Render without a code change.
export const REVIEW_LINKS = {
  // skeo on Google Maps, opened on its reviews.
  google: process.env.REVIEW_GOOGLE_URL || 'https://www.google.com/maps/place/skeo/@12.8649105,77.6516639,17z/data=!3m1!4b1!4m15!1m8!3m7!1s0x3bae6d7fcbafd03f:0x1a990535ac365ce!2sskeo!8m2!3d12.8649053!4d77.6542388!10e5!16s%2Fg%2F11zz7stzn9!3m5!1s0x3bae6d7fcbafd03f:0x1a990535ac365ce!8m2!3d12.8649053!4d77.6542388!16s%2Fg%2F11zz7stzn9?entry=ttu&g_ep=EgoyMDI2MTAyMC4wIKXMDSoASAFQAw%3D%3D',
  linkedin: process.env.REVIEW_LINKEDIN_URL || '',
};

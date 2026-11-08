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
export const REVIEW_INTRO = {
  title: 'How was the class?',
  note: 'Rate each from 1 (low) to 5 (high).',
};

export const REVIEW_QUESTIONS = [
  { id: 'session', label: "How would you rate today's session?", type: 'rating', required: true },
  { id: 'useful', label: 'How useful was the session for you?', type: 'rating', required: true },
  { id: 'understood', label: 'How well did you understand what was taught?', type: 'rating', required: true },
  { id: 'instructor', label: 'How would you rate the instructor and session experience?', type: 'rating', required: true },
  {
    id: 'comment',
    label: 'What did you like most, and what can we improve?',
    type: 'text',
    long: true,
    required: false,
    max: 2000,
    placeholder: "What worked, what didn't, anything you want covered again…",
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

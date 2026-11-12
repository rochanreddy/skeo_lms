import mongoose from 'mongoose';

// The LMS roles. A user has exactly one. This list is the single source of
// truth for role-based access: requireRole() gates routes against it, admin
// provisioning validates against it, and any account whose role falls outside
// it (a retired 'mentor' or 'partner' from the old LMS) is denied at login.
export const ROLES = ['student', 'admin'];

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: '' },
    fullName: { type: String, default: '' },
    phone: { type: String, default: '' },

    role: { type: String, enum: ROLES, default: 'student', index: true },

    // Which profile they fill in: a student gives their UG/PG course and any
    // internship, a working professional their company, role and experience.
    stage: { type: String, enum: ['', 'student', 'professional'], default: '' },
    linkedin: { type: String, default: '', trim: true },
    education: { type: mongoose.Schema.Types.Mixed, default: {} },     // { level: 'UG'|'PG', degree, institution, year }
    professional: { type: mongoose.Schema.Types.Mixed, default: {} },  // { title, company, experience, internship: { company, role, duration } }

    batchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],

    // Last authenticated request, stamped (throttled) by requireAuth. Drives the
    // inactivity signal in at-risk detection. Null = never seen since this was
    // added, which the scorer treats as "unknown" rather than "inactive".
    lastActiveAt: { type: Date, default: null },

    emailVerified: { type: Boolean, default: false },
    resetTokenHash: { type: String, default: '' },
    resetExpires: { type: Date, default: null },
    // When the password was last set through a reset link. Tokens are
    // stateless, so this is what ends the sessions that were open before it:
    // requireAuth and /auth/refresh refuse any token issued earlier. A reset is
    // how someone takes an account back, and leaving a 30-day refresh token
    // working for whoever had it would defeat the point.
    passwordChangedAt: { type: Date, default: null },

    // Set when an admin provisions/resets the account: the user must set their
    // own password before they can use the app.
    mustChangePassword: { type: Boolean, default: false },

    // Bought "Everything AI. One Access" (₹799) on the website. That plan
    // unlocks every batch: including ones created after the purchase, so it
    // is recorded as a standing entitlement, not only as enrolments made on the
    // day: routes/batches.js enrols every allAccess student into each new batch
    // as it is created. Set by routes/provision.js; never set by a student.
    allAccess: { type: Boolean, default: false, index: true },

    // A free trial from a campaign page (provision item `free`): full access
    // until this moment, then the account reads as unpaid (utils/access.js
    // trialEnded) and sign-in points to the plans. Cleared by any purchase.
    trialEndsAt: { type: Date, default: null },

    // Admin moderation controls. lms=true locks the account out of the whole
    // app (login + every API call); batchIds hides specific cohorts/courses;
    // moduleIds hides specific curriculum modules; assignmentIds hides specific
    // assignments/projects. Admins are never blockable, enforced in the
    // routes, not here.
    blocked: {
      lms: { type: Boolean, default: false },
      batchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],
      moduleIds: [{ type: mongoose.Schema.Types.ObjectId }], // Program.modules subdoc ids
      assignmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' }],
      reason: { type: String, default: '' },
      at: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

// The admin student list: filtered by role, newest first. `role` alone was
// indexed, which narrowed the scan but still left every student document to be
// sorted in memory.
userSchema.index({ role: 1, createdAt: -1 });

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    email: this.email,
    full_name: this.fullName,
    phone: this.phone,
    role: this.role,
    stage: this.stage || '',
    linkedin: this.linkedin || '',
    education: this.education,
    professional: this.professional,
    batch_ids: (this.batchIds || []).map((b) => b.toString()),
    email_verified: this.emailVerified,
    must_change_password: this.mustChangePassword,
    blocked: {
      lms: !!this.blocked?.lms,
      batch_ids: (this.blocked?.batchIds || []).map(String),
      module_ids: (this.blocked?.moduleIds || []).map(String),
      assignment_ids: (this.blocked?.assignmentIds || []).map(String),
      reason: this.blocked?.reason || '',
      at: this.blocked?.at || null,
    },
    last_active_at: this.lastActiveAt,
    created_at: this.createdAt,
  };
};

// IMPORTANT: explicit 'skeo_users' collection so this NEVER collides with the
// marketing site's 'users' collection in the shared Atlas database.
export const User = mongoose.model('User', userSchema, 'skeo_users');

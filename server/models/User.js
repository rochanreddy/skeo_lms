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

    education: { type: mongoose.Schema.Types.Mixed, default: {} },     // { degree, institution, year }
    professional: { type: mongoose.Schema.Types.Mixed, default: {} },  // { title, company, experience }
    resumeUrl: { type: String, default: '' },

    batchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],

    // Last authenticated request, stamped (throttled) by requireAuth. Drives the
    // inactivity signal in at-risk detection. Null = never seen since this was
    // added, which the scorer treats as "unknown" rather than "inactive".
    lastActiveAt: { type: Date, default: null },

    emailVerified: { type: Boolean, default: false },
    resetTokenHash: { type: String, default: '' },
    resetExpires: { type: Date, default: null },

    // Set when an admin provisions/resets the account: the user must set their
    // own password before they can use the app.
    mustChangePassword: { type: Boolean, default: false },

    // Admin moderation controls. lms=true locks the account out of the whole
    // app (login + every API call); batchIds hides specific cohorts/courses;
    // moduleIds hides specific curriculum modules; assignmentIds hides specific
    // assignments/projects. Admins are never blockable — enforced in the
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

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    email: this.email,
    full_name: this.fullName,
    phone: this.phone,
    role: this.role,
    education: this.education,
    professional: this.professional,
    resume_url: this.resumeUrl,
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

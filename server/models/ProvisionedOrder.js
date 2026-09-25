import mongoose from 'mongoose';

// One row per paid website order the LMS has acted on.
//
// This is what makes provisioning safe to call more than once, which it will
// be: Cashfree retries its webhook until it gets a 200, the website also
// confirms the order when the buyer lands back on /thank-you, and either can
// arrive twice. The unique orderId is the lock — the first caller inserts the
// row and does the work; every later one finds it and gets the same answer
// back, without a second account, a second enrolment or a second login mail.
const provisionedOrderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    items: { type: [String], default: [] },
    status: { type: String, enum: ['processing', 'done', 'failed'], default: 'processing', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    batchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],
    // Whether this order made the account, or added to one that existed.
    created: { type: Boolean, default: false },
    emailed: { type: Boolean, default: false },
    // The playbooks mail, for an order that includes them. Its own flag, so a
    // retry after it failed resends only the playbooks, not the login.
    playbooksSent: { type: Boolean, default: false },
    // Things an admin should look at — e.g. a Claude Course bought while no
    // batch named "Claude" exists, so nothing could be unlocked.
    warnings: { type: [String], default: [] },
    error: { type: String, default: '' },
  },
  { timestamps: true },
);

export const ProvisionedOrder = mongoose.model('ProvisionedOrder', provisionedOrderSchema, 'skeo_provisioned_orders');

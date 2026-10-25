import mongoose from 'mongoose';

// One browser or installed app that has agreed to receive push notifications
// for a user. A person with the app on a phone and a laptop has two.
//
// The endpoint is the push service's URL for this one device (FCM, Mozilla,
// Apple, WNS) and is unique: if a second person signs in on the same browser
// and turns alerts on, the row moves to them rather than the device being
// subscribed for both.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    // For a human reading the collection ("which device is this?"), never for logic.
    userAgent: { type: String, default: '' },
  },
  { timestamps: true },
);

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema, 'skeo_push_subscriptions');

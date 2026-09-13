import mongoose from "mongoose";

const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    endpoint: {
      type: String,
      required: true,
      trim: true,
    },

    keys: {
      p256dh: {
        type: String,
        required: true,
      },
      auth: {
        type: String,
        required: true,
      },
    },
  },
  {
    timestamps: true,
  },
);

// One subscription per browser endpoint
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

// Fast lookup by user
pushSubscriptionSchema.index({ userId: 1, createdAt: -1 });

const PushSubscriptionModel =
  mongoose.models.PushSubscription ||
  mongoose.model("PushSubscription", pushSubscriptionSchema);

export default PushSubscriptionModel;

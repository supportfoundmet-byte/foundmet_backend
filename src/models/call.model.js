import mongoose from "mongoose";

const callSchema = new mongoose.Schema(
  {
    caller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    callee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // "missed" = callee never answered, "answered" = call connected,
    // "rejected" = callee declined, "ended" = normal hang-up,
    // "busy" = callee already in a call
    status: {
      type: String,
      enum: ["missed", "answered", "rejected", "ended", "busy"],
      default: "missed",
      index: true,
    },

    // ISO timestamps for when the call actually started/ended (only when answered)
    startedAt: { type: Date, default: null },
    endedAt:   { type: Date, default: null },

    // Seconds of connected call duration (calculated on endedAt)
    duration: { type: Number, default: 0 },
  },
  {
    timestamps: true, // createdAt = when the call was initiated
  },
);

// Fast lookup: "show me all calls for user X"
callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ callee: 1, createdAt: -1 });

// Allow finding a call between two specific users quickly
callSchema.index({ caller: 1, callee: 1, createdAt: -1 });

const CallModel =
  mongoose.models.Call || mongoose.model("Call", callSchema);

export default CallModel;

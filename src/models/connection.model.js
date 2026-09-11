import mongoose from "mongoose";

const connectionSchema = new mongoose.Schema(
  {
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    message: {
      type: String,
      maxlength: 500,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate requests between the same two users
connectionSchema.index({ fromUser: 1, toUser: 1 }, { unique: true });
connectionSchema.index({ fromUser: 1, createdAt: -1 });
connectionSchema.index({ toUser: 1, status: 1, createdAt: -1 });

const ConnectionModel = mongoose.model("Connection", connectionSchema);

export default ConnectionModel;

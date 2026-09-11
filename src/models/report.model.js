import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetType: {
      type: String,
      enum: ["user", "post", "message", "other"],
      default: "user",
      index: true,
    },
    targetContentId: { type: String, trim: true, maxlength: 80, default: "" },
    reason: {
      type: String,
      enum: [
        "spam",
        "fake-account",
        "fake-profile",
        "scam",
        "harassment",
        "abuse",
        "inappropriate",
        "impersonation",
        "unsafe",
        "other",
      ],
      required: true,
    },
    details: { type: String, trim: true, maxlength: 1000, default: "" },
    status: {
      type: String,
      enum: ["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED", "open", "resolved"],
      default: "OPEN",
      index: true,
    },
    assignedAdmin: { type: mongoose.Schema.Types.ObjectId, default: null },
    action: {
      type: String,
      enum: ["hidden", "restored", "blocked", "deleted", "dismissed", "warned", "suspended", "banned", "reviewed"],
    },
  },
  { timestamps: true },
);

reportSchema.index({ reporter: 1, targetUser: 1, targetType: 1, targetContentId: 1 }, { unique: true });
reportSchema.index({ targetUser: 1, createdAt: -1 });
reportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Report", reportSchema);

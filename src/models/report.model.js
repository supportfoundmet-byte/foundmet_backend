import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: {
      type: String,
      enum: ["spam", "harassment", "fake-profile", "unsafe", "other"],
      required: true,
    },
    details: { type: String, trim: true, maxlength: 1000, default: "" },
    status: { type: String, enum: ["open", "resolved"], default: "open", index: true },
    action: { type: String, enum: ["hidden", "restored", "blocked", "deleted", "dismissed"] },
  },
  { timestamps: true },
);

reportSchema.index({ reporter: 1, targetUser: 1 }, { unique: true });
reportSchema.index({ targetUser: 1, createdAt: -1 });

export default mongoose.model("Report", reportSchema);

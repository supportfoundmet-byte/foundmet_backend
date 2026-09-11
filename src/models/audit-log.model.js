import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    adminEmail: { type: String, trim: true, maxlength: 180 },
    action: { type: String, required: true, index: true, maxlength: 80 },
    targetType: { type: String, enum: ["user", "admin", "report", "post", "message", "system"], default: "system" },
    targetId: { type: String, trim: true, maxlength: 80, default: "" },
    reason: { type: String, trim: true, maxlength: 500, default: "" },
    ip: { type: String, trim: true, maxlength: 80, default: "" },
  },
  { timestamps: true },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLogModel = mongoose.model("AuditLog", auditLogSchema);
export default AuditLogModel;

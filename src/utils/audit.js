import AuditLogModel from "../models/audit-log.model.js";
import { logError, logInfo } from "./logger.js";

export async function writeAuditLog({ admin, action, targetType = "system", targetId = "", reason = "", req }) {
  try {
    await AuditLogModel.create({
      adminId: admin?._id,
      adminEmail: admin?.email,
      action,
      targetType,
      targetId: String(targetId || ""),
      reason: typeof reason === "string" ? reason.slice(0, 500) : "",
      ip: req?.ip || req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim() || "",
    });
    logInfo("admin_action", { action, targetType, targetId: String(targetId || "") });
  } catch (error) {
    logError("audit_log_failed", error, { action });
  }
}

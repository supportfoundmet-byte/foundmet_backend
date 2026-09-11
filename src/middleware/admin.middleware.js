import jwt from "jsonwebtoken";
import AdminModel from "../models/admin.model.js";
import { sendError } from "../utils/http.js";

export async function verifySuperAdmin(req, res, next) {
  try {
    const secret = process.env.SUPERADMIN_TOKEN_SECRET || process.env.ACCESS_TOKEN_SECRET;
    const token = req.cookies?.superAdminToken;
    if (!secret || !token) return sendError(res, 403, "Superadmin access required.", "FORBIDDEN");
    const payload = jwt.verify(token, secret);
    if (!payload?._id) return sendError(res, 403, "Superadmin access required.", "FORBIDDEN");
    const admin = await AdminModel.findOne({
      _id: payload._id,
      isBlocked: { $ne: true },
    }).select("_id email name role").lean();
    if (!admin) return sendError(res, 403, "Admin access has been revoked.", "FORBIDDEN");
    req.admin = { ...admin, role: admin.role || "SUPER_ADMIN" };
    next();
  } catch {
    return sendError(res, 403, "Invalid admin session.", "INVALID_SESSION");
  }
}

export function requireAdminRole(...roles) {
  return (req, res, next) => {
    const role = req.admin?.role || "SUPER_ADMIN";
    if (!roles.includes(role)) {
      return sendError(res, 403, "You do not have permission for this action.", "FORBIDDEN");
    }
    return next();
  };
}

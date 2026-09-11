import jwt from "jsonwebtoken";
import AdminModel from "../models/admin.model.js";

export async function verifySuperAdmin(req, res, next) {
  try {
    const secret = process.env.SUPERADMIN_TOKEN_SECRET || process.env.ACCESS_TOKEN_SECRET;
    const token = req.cookies?.superAdminToken;
    if (!secret || !token) return res.status(403).json({ success: false, message: "Superadmin access required." });
    const payload = jwt.verify(token, secret);
    if (!payload?.isSuperAdmin || !payload?._id) return res.status(403).json({ success: false, message: "Superadmin access required." });
    const admin = await AdminModel.findOne({
      _id: payload._id,
      isBlocked: { $ne: true },
    }).select("_id email name isSuperAdmin").lean();
    if (!admin) return res.status(403).json({ success: false, message: "Superadmin access has been revoked." });
    req.admin = admin;
    next();
  } catch {
    return res.status(403).json({ success: false, message: "Invalid superadmin session." });
  }
}

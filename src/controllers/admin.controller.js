import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import UserModel from "../models/user.model.js";
import ReportModel from "../models/report.model.js";
import AdminModel from "../models/admin.model.js";
import PostModel from "../models/post.model.js";
import ConnectionModel from "../models/connection.model.js";
import MessageModel from "../models/message.model.js";
import AuditLogModel from "../models/audit-log.model.js";
import { writeAuditLog } from "../utils/audit.js";
import { sendError, sendSuccess } from "../utils/http.js";
import { logError } from "../utils/logger.js";
import { isStrongPassword } from "../utils/sanitize.js";

const usesCrossSiteCookies =
  process.env.NODE_ENV === "production" ||
  (process.env.FRONTEND_URL || "")
    .split(",")
    .some((origin) => /^https:\/\//i.test(origin.trim()));

const cookieOptions = {
  httpOnly: true,
  secure: usesCrossSiteCookies,
  sameSite: usesCrossSiteCookies ? "none" : "lax",
  maxAge: 8 * 60 * 60 * 1000,
  path: "/",
};

const isSuper = (admin) => (admin?.role || "SUPER_ADMIN") === "SUPER_ADMIN";

export async function adminLogin(req, res) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body?.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || typeof password !== "string" || password.length < 8 || password.length > 128) {
    return sendError(res, 400, "Enter a valid email and password.", "VALIDATION_ERROR");
  }
  const admin = await AdminModel.findOne({ email }).select("+password").lean();
  if (!admin || !(await bcrypt.compare(password, admin.password))) {
    return sendError(res, 401, "Invalid superadmin credentials.", "INVALID_CREDENTIALS");
  }
  if (admin.isBlocked) return sendError(res, 403, "This admin account is blocked.", "ACCOUNT_BANNED");
  const secret = process.env.SUPERADMIN_TOKEN_SECRET || process.env.ACCESS_TOKEN_SECRET;
  if (!secret) return sendError(res, 503, "Superadmin security is not configured.", "AUTH_UNAVAILABLE");
  const role = admin.role || "SUPER_ADMIN";
  const token = jwt.sign({ _id: admin._id, email: admin.email, role, isSuperAdmin: role === "SUPER_ADMIN" }, secret, {
    expiresIn: "8h",
  });
  res.cookie("superAdminToken", token, cookieOptions);
  return res.json({
    success: true,
    message: "Signed in",
    admin: { _id: admin._id, email: admin.email, name: admin.name, role },
    accessToken: token,
  });
}

export function adminLogout(req, res) {
  res.clearCookie("superAdminToken", { ...cookieOptions, maxAge: undefined });
  return sendSuccess(res, "Logged out");
}

export function adminSession(req, res) {
  return res.json({ success: true, message: "Admin session", admin: req.admin, data: { admin: req.admin } });
}

export async function listAdminData(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 80) : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const city = typeof req.query.city === "string" ? req.query.city.trim().slice(0, 80) : "";
    const role = typeof req.query.role === "string" ? req.query.role.trim() : "";
    const reportStatus = ["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED", "open", "resolved"].includes(req.query.reportStatus)
      ? req.query.reportStatus
      : undefined;
    const userFilter = { isSuperAdmin: { $ne: true }, adminRole: { $ne: "superadmin" } };
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
        { role: { $regex: safeSearch, $options: "i" } },
        { address: { $regex: safeSearch, $options: "i" } },
        { "location.city": { $regex: safeSearch, $options: "i" } },
      ];
      if (mongoose.isValidObjectId(search)) or.push({ _id: search });
      userFilter.$or = or;
    }
    if (status === "suspended") userFilter.accountStatus = "suspended";
    if (status === "banned" || status === "blocked") userFilter.$or = [{ accountStatus: "banned" }, { isBlocked: true }];
    if (status === "spam") userFilter.isSpam = true;
    if (status === "suspicious") userFilter.isSuspicious = true;
    if (status === "deleted") userFilter.isDeleted = true;
    if (status === "active") {
      userFilter.isDeleted = { $ne: true };
      userFilter.accountStatus = "active";
      userFilter.isBlocked = { $ne: true };
    }
    if (city) userFilter["location.city"] = { $regex: city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    if (["founder", "co-founder"].includes(role)) userFilter.role = role;
    const postFilter = {};
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      postFilter.text = { $regex: safeSearch, $options: "i" };
    }
    const reportFilter = {};
    if (reportStatus === "open") reportFilter.status = { $in: ["OPEN", "open"] };
    else if (reportStatus) reportFilter.status = reportStatus;
    const [users, reports, admins, posts, totalUsers] = await Promise.all([
      UserModel.find(userFilter)
        .select("name email role address hiddenFromFeed isBlocked reportCount createdAt lastLogin location accountStatus isDeleted isSpam isSuspicious")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ReportModel.find(reportFilter)
        .populate({ path: "reporter", select: "name email", match: { isSuperAdmin: { $ne: true } } })
        .populate({ path: "targetUser", select: "name email reportCount hiddenFromFeed isBlocked accountStatus", match: { isSuperAdmin: { $ne: true } } })
        .sort({ createdAt: -1 })
        .limit(100)
        .skip(0)
        .lean(),
      AdminModel.find().select("name email createdAt isBlocked role").sort({ createdAt: 1 }).limit(100).lean(),
      PostModel.find(postFilter)
        .populate({ path: "author", select: "name email", match: { isSuperAdmin: { $ne: true } } })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      UserModel.countDocuments(userFilter),
    ]);
    const visibleReports = reports.filter((report) => report.reporter && report.targetUser);
    const visiblePosts = posts.filter((post) => post.author);
    res.set("Cache-Control", "no-store");
    return res.json({
      success: true,
      message: "Admin data loaded",
      users,
      reports: visibleReports,
      admins,
      posts: visiblePosts,
      pagination: { page, limit, total: totalUsers, totalPages: Math.ceil(totalUsers / limit) || 1 },
    });
  } catch (error) {
    logError("admin_data", error);
    return sendError(res, 500, "Admin data could not be loaded.", "INTERNAL_ERROR");
  }
}

export async function systemStatus(req, res) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const memberFilter = { isSuperAdmin: { $ne: true }, isDeleted: { $ne: true } };
  const [
    userCount,
    activeUsers,
    newUsers,
    suspendedUsers,
    bannedUsers,
    reportCount,
    openReportCount,
    postCount,
    connectionCount,
    messageCount,
  ] = await Promise.all([
    UserModel.countDocuments(memberFilter),
    UserModel.countDocuments({ ...memberFilter, lastLogin: { $gte: monthAgo } }),
    UserModel.countDocuments({ ...memberFilter, createdAt: { $gte: weekAgo } }),
    UserModel.countDocuments({ ...memberFilter, accountStatus: "suspended" }),
    UserModel.countDocuments({ $or: [{ accountStatus: "banned" }, { isBlocked: true }], isDeleted: { $ne: true } }),
    ReportModel.countDocuments(),
    ReportModel.countDocuments({ status: { $in: ["OPEN", "open", "UNDER_REVIEW"] } }),
    PostModel.countDocuments(),
    ConnectionModel.countDocuments({ status: "accepted" }),
    MessageModel.countDocuments(),
  ]);
  res.set("Cache-Control", "no-store");
  return res.json({
    success: true,
    status: {
      database: mongoose.connection.readyState === 1 ? "connected" : "unavailable",
      uptimeSeconds: Math.round(process.uptime()),
      users: userCount,
      activeUsers,
      newUsers,
      suspendedUsers,
      bannedUsers,
      reports: reportCount,
      openReports: openReportCount,
      posts: postCount,
      connections: connectionCount,
      messages: messageCount,
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  });
}

export async function listAuditLogs(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const [logs, total] = await Promise.all([
    AuditLogModel.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLogModel.countDocuments(),
  ]);
  return res.json({
    success: true,
    logs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  });
}

export async function createSuperAdmin(req, res) {
  if (!isSuper(req.admin) && req.admin.role !== "ADMIN") {
    return sendError(res, 403, "You do not have permission to create administrators.", "FORBIDDEN");
  }
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const password = req.body?.password;
  let role = typeof req.body?.role === "string" ? req.body.role : "ADMIN";
  if (!["SUPER_ADMIN", "ADMIN", "MODERATOR"].includes(role)) role = "ADMIN";
  if (role === "SUPER_ADMIN" && !isSuper(req.admin)) {
    return sendError(res, 403, "Only a Super Admin can create another Super Admin.", "FORBIDDEN");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || name.length < 2 || name.length > 100 || !isStrongPassword(password) || password.length < 12) {
    return sendError(res, 400, "Use a valid email, name, and password of at least 12 characters with a letter and a number.", "VALIDATION_ERROR");
  }
  try {
    const admin = await AdminModel.create({
      email,
      name,
      password: await bcrypt.hash(password, 12),
      role,
    });
    await writeAuditLog({ admin: req.admin, action: "CREATE_ADMIN", targetType: "admin", targetId: admin._id, reason: role, req });
    return res.status(201).json({ success: true, message: "Administrator created", admin: { _id: admin._id, email: admin.email, name: admin.name, role: admin.role } });
  } catch (error) {
    if (error?.code === 11000) return sendError(res, 409, "An account with this email already exists.", "CONFLICT");
    throw error;
  }
}

export async function moderateAdmin(req, res) {
  if (!isSuper(req.admin)) return sendError(res, 403, "Only a Super Admin can manage administrators.", "FORBIDDEN");
  const { adminId } = req.params;
  const { action } = req.body || {};
  if (!mongoose.isValidObjectId(adminId) || !["block", "unblock", "delete"].includes(action)) {
    return sendError(res, 400, "Invalid Superadmin action.", "VALIDATION_ERROR");
  }
  if (String(req.admin._id) === String(adminId)) {
    return sendError(res, 400, "You cannot change your own Superadmin account.", "VALIDATION_ERROR");
  }
  if (action === "delete") {
    const activeAdmins = await AdminModel.countDocuments({ isBlocked: { $ne: true }, role: "SUPER_ADMIN" });
    if (activeAdmins <= 1) return sendError(res, 409, "At least one active Super Admin must remain.", "CONFLICT");
    const deleted = await AdminModel.findByIdAndDelete(adminId);
    if (!deleted) return sendError(res, 404, "Administrator not found.", "NOT_FOUND");
    await writeAuditLog({ admin: req.admin, action: "REMOVE_ADMIN", targetType: "admin", targetId: adminId, req });
  } else {
    const updated = await AdminModel.findOneAndUpdate({ _id: adminId }, { $set: { isBlocked: action === "block" } });
    if (!updated) return sendError(res, 404, "Administrator not found.", "NOT_FOUND");
    await writeAuditLog({ admin: req.admin, action: action === "block" ? "REMOVE_ADMIN" : "RESTORE_ADMIN", targetType: "admin", targetId: adminId, req });
  }
  return sendSuccess(res, `Administrator ${action === "delete" ? "deleted" : `${action}ed`}.`);
}

export async function moderateUser(req, res) {
  const { userId } = req.params;
  const { action, reason } = req.body || {};
  const allowed = ["hide", "restore", "block", "unblock", "delete", "suspend", "ban", "spam", "suspicious", "warn"];
  if (!mongoose.isValidObjectId(userId) || !allowed.includes(action)) {
    return sendError(res, 400, "Invalid moderation action.", "VALIDATION_ERROR");
  }
  if (["delete", "ban"].includes(action) && req.admin.role === "MODERATOR") {
    return sendError(res, 403, "Moderators cannot ban or delete users.", "FORBIDDEN");
  }
  const user = await UserModel.findOne({ _id: userId, isSuperAdmin: { $ne: true } });
  if (!user) return sendError(res, 404, "User not found.", "NOT_FOUND");
  if (action === "warn") {
    user.warnings.push({ message: typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : "Please follow FoundMet community guidelines." });
    await user.save();
    await writeAuditLog({ admin: req.admin, action: "WARN_USER", targetType: "user", targetId: userId, reason, req });
    return sendSuccess(res, "Warning sent.");
  }
  if (action === "delete") {
    user.isDeleted = true;
    user.deletedAt = new Date();
    user.deletedBy = req.admin._id;
    user.deletionReason = typeof reason === "string" ? reason.slice(0, 500) : "Removed by administrator";
    user.hiddenFromFeed = true;
    user.accountStatus = "banned";
    await user.save();
    await writeAuditLog({ admin: req.admin, action: "DELETE_USER", targetType: "user", targetId: userId, reason, req });
    return sendSuccess(res, "User deleted.");
  }
  const updates = {
    hide: { hiddenFromFeed: true },
    restore: { hiddenFromFeed: false, isBlocked: false, isDeleted: false, accountStatus: "active", blockedAt: null, blockedBy: null },
    block: { isBlocked: true, accountStatus: "banned", blockedAt: new Date(), blockedBy: req.admin._id, hiddenFromFeed: true },
    unblock: { isBlocked: false, accountStatus: "active", blockedAt: null, blockedBy: null },
    suspend: { accountStatus: "suspended", hiddenFromFeed: true },
    ban: { isBlocked: true, accountStatus: "banned", blockedAt: new Date(), blockedBy: req.admin._id, hiddenFromFeed: true },
    spam: { isSpam: true, hiddenFromFeed: true },
    suspicious: { isSuspicious: true },
  }[action];
  Object.assign(user, updates);
  await user.save();
  await writeAuditLog({
    admin: req.admin,
    action: action === "suspend" ? "SUSPEND_USER" : action === "ban" || action === "block" ? "BAN_USER" : "MODERATE_USER",
    targetType: "user",
    targetId: userId,
    reason: reason || action,
    req,
  });
  return sendSuccess(res, `User ${action}ed.`);
}

export async function moderateReport(req, res) {
  const { reportId } = req.params;
  const { action, reason } = req.body || {};
  if (!mongoose.isValidObjectId(reportId) || !["hide", "restore", "block", "delete", "dismiss", "review", "warn", "suspend", "ban"].includes(action)) {
    return sendError(res, 400, "Invalid report action.", "VALIDATION_ERROR");
  }
  const report = await ReportModel.findById(reportId);
  if (!report) return sendError(res, 404, "Report not found.", "NOT_FOUND");
  report.assignedAdmin = req.admin._id;
  if (action === "review") {
    report.status = "UNDER_REVIEW";
    report.action = "reviewed";
    await report.save();
    return sendSuccess(res, "Report marked under review.");
  }
  if (action === "dismiss") {
    report.status = "DISMISSED";
    report.action = "dismissed";
    await report.save();
    await writeAuditLog({ admin: req.admin, action: "DISMISS_REPORT", targetType: "report", targetId: reportId, reason, req });
    return sendSuccess(res, "Report dismissed.");
  }
  if (action === "warn") {
    await UserModel.findByIdAndUpdate(report.targetUser, {
      $push: { warnings: { message: reason || "A report against your profile was reviewed." } },
    });
    report.status = "RESOLVED";
    report.action = "warned";
    await report.save();
    await writeAuditLog({ admin: req.admin, action: "RESOLVE_REPORT", targetType: "report", targetId: reportId, reason: "warn", req });
    return sendSuccess(res, "User warned.");
  }
  const userUpdates = {
    hide: { hiddenFromFeed: true },
    restore: { hiddenFromFeed: false, isBlocked: false, accountStatus: "active" },
    block: { isBlocked: true, accountStatus: "banned", hiddenFromFeed: true, blockedAt: new Date(), blockedBy: req.admin._id },
    ban: { isBlocked: true, accountStatus: "banned", hiddenFromFeed: true, blockedAt: new Date(), blockedBy: req.admin._id },
    suspend: { accountStatus: "suspended", hiddenFromFeed: true },
    delete: { isDeleted: true, deletedAt: new Date(), deletedBy: req.admin._id, deletionReason: report.reason, hiddenFromFeed: true, accountStatus: "banned" },
  }[action];
  if (userUpdates) {
    await UserModel.findByIdAndUpdate(report.targetUser, { $set: userUpdates });
  }
  report.status = "RESOLVED";
  report.action = action === "hide" ? "hidden" : action === "restore" ? "restored" : action === "block" || action === "ban" ? "blocked" : action === "suspend" ? "suspended" : "deleted";
  await report.save();
  await writeAuditLog({ admin: req.admin, action: "RESOLVE_REPORT", targetType: "report", targetId: reportId, reason: action, req });
  return sendSuccess(res, "Report action completed.");
}

export async function deletePost(req, res) {
  if (!mongoose.isValidObjectId(req.params.postId)) return sendError(res, 400, "Invalid post.", "VALIDATION_ERROR");
  const post = await PostModel.findByIdAndDelete(req.params.postId).lean();
  if (!post) return sendError(res, 404, "Post not found.", "NOT_FOUND");
  await writeAuditLog({ admin: req.admin, action: "DELETE_POST", targetType: "post", targetId: req.params.postId, req });
  return sendSuccess(res, "Post deleted.");
}

export async function congratulateUser(req, res) {
  const { userId } = req.params;
  const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 500) : "Congratulations on finding your co-founder!";
  if (!mongoose.isValidObjectId(userId)) return sendError(res, 400, "Invalid user.", "VALIDATION_ERROR");
  const user = await UserModel.findOneAndUpdate(
    { _id: userId, isSuperAdmin: { $ne: true } },
    { $push: { congratulations: { message } } },
    { new: true, projection: "name congratulations" },
  ).lean();
  if (!user) return sendError(res, 404, "User not found.", "NOT_FOUND");
  return sendSuccess(res, `Congratulations sent to ${user.name}.`);
}

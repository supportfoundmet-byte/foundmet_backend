import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import UserModel from "../models/user.model.js";
import ReportModel from "../models/report.model.js";
import AdminModel from "../models/admin.model.js";
import PostModel from "../models/post.model.js";
import { purgeUserById } from "../utils/purge-user.js";

const usesCrossSiteCookies =
  process.env.NODE_ENV === "production" ||
  /^https:\/\//i.test(process.env.FRONTEND_URL || "");

const cookieOptions = {
  httpOnly: true,
  secure: usesCrossSiteCookies,
  sameSite: usesCrossSiteCookies ? "none" : "lax",
  maxAge: 8 * 60 * 60 * 1000,
  path: "/",
};

export async function adminLogin(req, res) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body?.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || typeof password !== "string" || password.length < 8 || password.length > 128) {
    return res.status(400).json({ success: false, message: "Enter a valid email and password." });
  }
  const admin = await AdminModel.findOne({ email }).select("+password").lean();
  if (!admin || !(await bcrypt.compare(password, admin.password))) {
    return res.status(401).json({ success: false, message: "Invalid superadmin credentials." });
  }
  if (admin.isBlocked) return res.status(403).json({ success: false, message: "This admin account is blocked." });
  const secret = process.env.SUPERADMIN_TOKEN_SECRET || process.env.ACCESS_TOKEN_SECRET;
  if (!secret) return res.status(503).json({ success: false, message: "Superadmin security is not configured." });
  const token = jwt.sign({ _id: admin._id, email: admin.email, isSuperAdmin: true }, secret, { expiresIn: "8h" });
  res.cookie("superAdminToken", token, cookieOptions);
  return res.json({ success: true, admin: { _id: admin._id, email: admin.email, name: admin.name } });
}

export function adminLogout(req, res) {
  res.clearCookie("superAdminToken", { ...cookieOptions, maxAge: undefined });
  return res.json({ success: true });
}

export function adminSession(req, res) {
  return res.json({ success: true, admin: req.admin });
}

export async function listAdminData(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 80) : "";
    const reportStatus = req.query.reportStatus === "open" || req.query.reportStatus === "resolved" ? req.query.reportStatus : undefined;
    const userFilter = { isSuperAdmin: { $ne: true }, adminRole: { $ne: "superadmin" } };
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      userFilter.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
        { role: { $regex: safeSearch, $options: "i" } },
        { address: { $regex: safeSearch, $options: "i" } },
      ];
    }
    const postFilter = {};
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      postFilter.text = { $regex: safeSearch, $options: "i" };
    }
    const reportFilter = reportStatus ? { status: reportStatus } : {};
    const [users, reports, admins, posts, totalUsers] = await Promise.all([
      UserModel.find(userFilter).select("name email role address hiddenFromFeed isBlocked reportCount createdAt lastLogin location").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ReportModel.find(reportFilter).populate({ path: "reporter", select: "name email", match: { isSuperAdmin: { $ne: true } } }).populate({ path: "targetUser", select: "name email reportCount hiddenFromFeed isBlocked", match: { isSuperAdmin: { $ne: true } } }).sort({ createdAt: -1 }).limit(500).lean(),
      AdminModel.find().select("name email createdAt isBlocked").sort({ createdAt: 1 }).limit(100).lean(),
      PostModel.find(postFilter).populate({ path: "author", select: "name email", match: { isSuperAdmin: { $ne: true } } }).sort({ createdAt: -1 }).limit(100).lean(),
      UserModel.countDocuments(userFilter),
    ]);
    const visibleReports = reports.filter((report) => report.reporter && report.targetUser);
    const visiblePosts = posts.filter((post) => post.author);
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, users, reports: visibleReports, admins, posts: visiblePosts, pagination: { page, limit, total: totalUsers, totalPages: Math.ceil(totalUsers / limit) } });
  } catch (error) {
    console.error("Admin data error:", error);
    return res.status(500).json({ success: false, message: "Admin data could not be loaded." });
  }
}

export async function systemStatus(req, res) {
  const [userCount, reportCount, openReportCount, postCount] = await Promise.all([
    UserModel.countDocuments({ isSuperAdmin: { $ne: true } }),
    ReportModel.countDocuments(),
    ReportModel.countDocuments({ status: "open" }),
    PostModel.countDocuments(),
  ]);
  res.set("Cache-Control", "no-store");
  return res.json({
    success: true,
    status: {
      database: mongoose.connection.readyState === 1 ? "connected" : "unavailable",
      uptimeSeconds: Math.round(process.uptime()),
      users: userCount,
      reports: reportCount,
      openReports: openReportCount,
      posts: postCount,
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  });
}

export async function createSuperAdmin(req, res) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const password = req.body?.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || name.length < 2 || name.length > 100 || typeof password !== "string" || password.length < 12 || password.length > 128) {
    return res.status(400).json({ success: false, message: "Use a valid email, name, and password of at least 12 characters." });
  }
  try {
    const admin = await AdminModel.create({
      email,
      name,
      password: await bcrypt.hash(password, 12),
    });
    return res.status(201).json({ success: true, admin: { _id: admin._id, email: admin.email, name: admin.name } });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "An account with this email already exists." });
    throw error;
  }
}

export async function moderateAdmin(req, res) {
  const { adminId } = req.params;
  const { action } = req.body || {};
  if (!mongoose.isValidObjectId(adminId) || !["block", "unblock", "delete"].includes(action)) {
    return res.status(400).json({ success: false, message: "Invalid Superadmin action." });
  }
  if (String(req.admin._id) === String(adminId)) {
    return res.status(400).json({ success: false, message: "You cannot change your own Superadmin account." });
  }
  if (action === "delete") {
    const activeAdmins = await AdminModel.countDocuments({ isBlocked: { $ne: true } });
    if (activeAdmins <= 1) return res.status(409).json({ success: false, message: "At least one active Superadmin must remain." });
    const deleted = await AdminModel.findByIdAndDelete(adminId);
    if (!deleted) return res.status(404).json({ success: false, message: "Superadmin not found." });
  } else {
    const updated = await AdminModel.findOneAndUpdate(
      { _id: adminId },
      { $set: { isBlocked: action === "block" } },
    );
    if (!updated) return res.status(404).json({ success: false, message: "Superadmin not found." });
  }
  return res.json({ success: true, message: `Superadmin ${action === "delete" ? "deleted" : `${action}ed`}.` });
}

export async function moderateUser(req, res) {
  const { userId } = req.params;
  const { action } = req.body || {};
  if (!mongoose.isValidObjectId(userId) || !["hide", "restore", "block", "unblock", "delete"].includes(action)) {
    return res.status(400).json({ success: false, message: "Invalid moderation action." });
  }
  if (action === "delete") {
    const deleted = await purgeUserById(userId);
    if (!deleted) return res.status(404).json({ success: false, message: "User not found." });
  } else {
    const updates = {
      hiddenFromFeed: action === "hide" ? true : action === "restore" ? false : undefined,
      isBlocked: action === "block" ? true : action === "unblock" ? false : undefined,
      blockedAt: action === "block" ? new Date() : action === "unblock" ? null : undefined,
      blockedBy: action === "block" ? req.admin._id : action === "unblock" ? null : undefined,
    };
    const cleaned = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));
    const updated = await UserModel.findOneAndUpdate(
      { _id: userId, isSuperAdmin: { $ne: true } },
      { $set: cleaned },
    );
    if (!updated) return res.status(404).json({ success: false, message: "User not found." });
  }
  return res.json({ success: true, message: `User ${action === "delete" ? "deleted" : `${action}ed`}.` });
}

export async function moderateReport(req, res) {
  const { reportId } = req.params;
  const { action } = req.body || {};
  if (!mongoose.isValidObjectId(reportId) || !["hide", "restore", "block", "delete", "dismiss"].includes(action)) {
    return res.status(400).json({ success: false, message: "Invalid report action." });
  }
  const report = await ReportModel.findById(reportId);
  if (!report) return res.status(404).json({ success: false, message: "Report not found." });
  if (action === "delete") await purgeUserById(report.targetUser);
  else if (action === "dismiss") {
    await UserModel.findByIdAndUpdate(report.targetUser, {
      $set: { hiddenFromFeed: false, isBlocked: false, blockedAt: null, blockedBy: null },
    });
  } else {
    await UserModel.findByIdAndUpdate(report.targetUser, {
      $set: {
        hiddenFromFeed: action !== "restore",
        isBlocked: action === "block",
        blockedAt: action === "block" ? new Date() : null,
        blockedBy: action === "block" ? req.admin._id : null,
      },
    });
  }
  report.status = "resolved";
  report.action = action === "hide" ? "hidden" : action === "restore" ? "restored" : action === "block" ? "blocked" : action === "dismiss" ? "dismissed" : "deleted";
  await report.save();
  return res.json({ success: true, message: "Report action completed." });
}

export async function deletePost(req, res) {
  if (!mongoose.isValidObjectId(req.params.postId)) return res.status(400).json({ success: false, message: "Invalid post." });
  const post = await PostModel.findByIdAndDelete(req.params.postId).lean();
  if (!post) return res.status(404).json({ success: false, message: "Post not found." });
  return res.json({ success: true, message: "Post deleted." });
}

export async function congratulateUser(req, res) {
  const { userId } = req.params;
  const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 500) : "Congratulations on finding your co-founder!";
  if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ success: false, message: "Invalid user." });
  const user = await UserModel.findOneAndUpdate(
    { _id: userId, isSuperAdmin: { $ne: true } },
    { $push: { congratulations: { message } } },
    { new: true, projection: "name congratulations" },
  ).lean();
  if (!user) return res.status(404).json({ success: false, message: "User not found." });
  return res.json({ success: true, message: `Congratulations sent to ${user.name}.` });
}

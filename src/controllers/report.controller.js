import mongoose from "mongoose";
import ReportModel from "../models/report.model.js";
import UserModel from "../models/user.model.js";
import { sendError } from "../utils/http.js";
import { logError } from "../utils/logger.js";
import { sanitizeText } from "../utils/sanitize.js";

const REASONS = [
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
];

export async function reportUser(req, res) {
  try {
    const reporter = req.user._id;
    const { userId } = req.params;
    const { reason, details, targetType, targetContentId } = req.body || {};

    if (!mongoose.isValidObjectId(userId) || String(reporter) === String(userId)) {
      return sendError(res, 400, "Invalid profile to report.", "VALIDATION_ERROR");
    }
    const normalizedReason = reason === "fake-profile" ? "fake-account" : reason;
    if (!REASONS.includes(normalizedReason)) {
      return sendError(res, 400, "Choose a valid report reason.", "VALIDATION_ERROR");
    }

    const target = await UserModel.findOne({ _id: userId, isSuperAdmin: { $ne: true }, isDeleted: { $ne: true } })
      .select("_id")
      .lean();
    if (!target) return sendError(res, 404, "Founder not found.", "NOT_FOUND");

    await ReportModel.create({
      reporter,
      targetUser: userId,
      targetType: ["user", "post", "message", "other"].includes(targetType) ? targetType : "user",
      targetContentId: typeof targetContentId === "string" ? targetContentId.slice(0, 80) : "",
      reason: normalizedReason,
      details: sanitizeText(details || "", 1000),
      status: "OPEN",
    });

    await UserModel.findByIdAndUpdate(userId, { $inc: { reportCount: 1 } });

    return res.status(201).json({
      success: true,
      message: "Report submitted. Our team will review it.",
    });
  } catch (error) {
    if (error?.code === 11000) {
      return sendError(res, 409, "You already reported this content.", "CONFLICT");
    }
    logError("report_user", error);
    return sendError(res, 500, "Unable to submit the report.", "INTERNAL_ERROR");
  }
}

import mongoose from "mongoose";
import ReportModel from "../models/report.model.js";
import UserModel from "../models/user.model.js";

export async function reportUser(req, res) {
  try {
    const reporter = req.user._id;
    const { userId } = req.params;
    const { reason, details } = req.body || {};

    if (!mongoose.isValidObjectId(userId) || String(reporter) === String(userId)) {
      return res.status(400).json({ success: false, message: "Invalid profile to report." });
    }
    if (!["spam", "harassment", "fake-profile", "unsafe", "other"].includes(reason)) {
      return res.status(400).json({ success: false, message: "Choose a valid report reason." });
    }

    const target = await UserModel.findOne({ _id: userId, isSuperAdmin: { $ne: true } }).select("_id").lean();
    if (!target) return res.status(404).json({ success: false, message: "Founder not found." });

    await ReportModel.create({
      reporter,
      targetUser: userId,
      reason,
      details: typeof details === "string" ? details.trim().slice(0, 1000) : "",
    });

    await UserModel.findByIdAndUpdate(userId, {
      $inc: { reportCount: 1 },
      $set: { hiddenFromFeed: true },
    });

    return res.status(201).json({
      success: true,
      message: "Thanks. This profile has been hidden while it is reviewed.",
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "You already reported this profile." });
    }
    console.error("Report User Error:", error);
    return res.status(500).json({ success: false, message: "Unable to submit the report." });
  }
}

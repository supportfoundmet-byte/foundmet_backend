import mongoose from "mongoose";
import CallModel from "../models/call.model.js";
import UserModel from "../models/user.model.js";
import { sendError } from "../utils/http.js";

/**
 * GET /api/v1/calls
 * Returns the last 50 calls (sent or received) for the logged-in user.
 */
export async function listCalls(req, res) {
  try {
    const userId = req.user._id;

    const calls = await CallModel.find({
      $or: [{ caller: userId }, { callee: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Gather unique user IDs for the other party in each call
    const otherIds = [
      ...new Set(
        calls.map((c) =>
          String(c.caller) === String(userId)
            ? String(c.callee)
            : String(c.caller),
        ),
      ),
    ];

    const users = await UserModel.find({ _id: { $in: otherIds } })
      .select("name photo")
      .lean();

    const userMap = Object.fromEntries(
      users.map((u) => [String(u._id), { name: u.name, photo: u.photo || "" }]),
    );

    const payload = calls.map((call) => {
      const isCaller = String(call.caller) === String(userId);
      const otherId = isCaller ? String(call.callee) : String(call.caller);
      const other = userMap[otherId] || { name: "Founder", photo: "" };

      return {
        id: String(call._id),
        direction: isCaller ? "outgoing" : "incoming",
        status: call.status,
        otherId,
        otherName: other.name,
        otherPhoto: other.photo,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        duration: call.duration,
        createdAt: call.createdAt,
      };
    });

    res.set("Cache-Control", "private, no-store");
    return res.status(200).json({
      success: true,
      message: "Call history loaded",
      calls: payload,
    });
  } catch (error) {
    console.error("LIST CALLS ERROR:", error);
    return sendError(res, 500, "Could not load call history.", "CALLS_LOAD_ERROR");
  }
}

/**
 * GET /api/v1/calls/missed-count
 * Returns the count of missed incoming calls since the user's last check.
 * Useful for badge notifications.
 */
export async function missedCallCount(req, res) {
  try {
    const userId = req.user._id;
    const since = req.query.since ? new Date(req.query.since) : null;

    const query = {
      callee: userId,
      status: "missed",
    };
    if (since && !isNaN(since.getTime())) {
      query.createdAt = { $gt: since };
    }

    const count = await CallModel.countDocuments(query);

    res.set("Cache-Control", "private, no-store");
    return res.status(200).json({ success: true, missedCount: count });
  } catch (error) {
    console.error("MISSED CALL COUNT ERROR:", error);
    return sendError(res, 500, "Could not load missed call count.", "CALLS_LOAD_ERROR");
  }
}

/**
 * DELETE /api/v1/calls/:callId
 * Remove a single call from the user's call history.
 */
export async function deleteCall(req, res) {
  try {
    const userId = req.user._id;
    const { callId } = req.params;

    if (!mongoose.isValidObjectId(callId)) {
      return sendError(res, 400, "Invalid call ID.", "VALIDATION_ERROR");
    }

    const call = await CallModel.findOneAndDelete({
      _id: callId,
      $or: [{ caller: userId }, { callee: userId }],
    });

    if (!call) {
      return sendError(res, 404, "Call not found.", "NOT_FOUND");
    }

    return res.status(200).json({ success: true, message: "Call removed from history." });
  } catch (error) {
    console.error("DELETE CALL ERROR:", error);
    return sendError(res, 500, "Could not remove call.", "CALL_DELETE_ERROR");
  }
}

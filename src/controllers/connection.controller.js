import ConnectionModel from "../models/connection.model.js";
import UserModel from "../models/user.model.js";
import mongoose from "mongoose";

/**
 * Send a connection request to another founder
 * POST /api/v1/connections/request/:userId
 */
export async function sendConnectionRequest(req, res) {
  try {
    const fromUserId = req.user._id;
    const toUserId = req.params.userId;

    if (!toUserId) {
      return res.status(400).json({
        success: false,
        message: "Target user ID is required",
      });
    }

    if (!mongoose.isValidObjectId(toUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid founder profile.",
      });
    }

    if (fromUserId.toString() === toUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot send a connection request to yourself",
      });
    }

    // Check if target user exists
    const targetUser = await UserModel.findOne({ _id: toUserId, isSuperAdmin: { $ne: true }, isBlocked: { $ne: true }, hiddenFromFeed: { $ne: true } }).select("name");
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "Founder not found",
      });
    }

    // Check if connection already exists
    const existing = await ConnectionModel.findOne({
      $or: [
        { fromUser: fromUserId, toUser: toUserId },
        { fromUser: toUserId, toUser: fromUserId },
      ],
    });

    if (existing) {
      if (existing.status === "accepted") {
        return res.status(200).json({
          success: true,
          message: "Already connected with this founder",
          connection: { _id: existing._id, status: existing.status },
        });
      }

      if (existing.status === "pending") {
        const incoming = String(existing.toUser) === String(fromUserId);
        return res.status(200).json({
          success: true,
          message: incoming
            ? "This founder already sent you a request. Open Dashboard to accept it."
            : "Connection request already sent",
          connection: { _id: existing._id, status: existing.status },
        });
      }

      existing.fromUser = fromUserId;
      existing.toUser = toUserId;
      existing.status = "pending";
      existing.message =
        typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 500) : "";
      await existing.save();
      return res.status(201).json({
        success: true,
        message: `Connection request sent to ${targetUser.name}!`,
        connection: existing,
      });
    }

    const connection = await ConnectionModel.create({
      fromUser: fromUserId,
      toUser: toUserId,
      status: "pending",
      message:
        typeof req.body?.message === "string"
          ? req.body.message.trim().slice(0, 500)
          : "",
    });

    return res.status(201).json({
      success: true,
      message: `Connection request sent to ${targetUser.name}!`,
      connection,
    });
  } catch (error) {
    console.error("Send Connection Error:", error);
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A connection request already exists.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to send connection request",
    });
  }
}

/**
 * Get all connections and requests for the logged-in user
 * GET /api/v1/connections
 */
export async function getMyConnections(req, res) {
  try {
    const userId = req.user._id;

    const connections = await ConnectionModel.find({
      $or: [{ fromUser: userId }, { toUser: userId }],
    })
      .populate({
        path: "fromUser",
        select: "name role address photo projectDetails projectStatus phoneNumber allowPhoneRequest",
        match: { isSuperAdmin: { $ne: true }, isBlocked: { $ne: true } },
      })
      .populate({
        path: "toUser",
        select: "name role address photo projectDetails projectStatus phoneNumber allowPhoneRequest",
        match: { isSuperAdmin: { $ne: true }, isBlocked: { $ne: true } },
      })
      .sort({ createdAt: -1 })
      .lean();

    const visibleConnections = connections.filter((connection) => connection.fromUser && connection.toUser);
    const sentRequests = visibleConnections.filter(
      (c) =>
        c.fromUser?._id?.toString() === userId.toString() &&
        c.status === "pending",
    );

    const receivedRequests = visibleConnections.filter(
      (c) =>
        c.toUser?._id?.toString() === userId.toString() &&
        c.status === "pending",
    );

    const connected = visibleConnections.filter((c) => c.status === "accepted");

    return res.status(200).json({
      success: true,
      totalCount: visibleConnections.length,
      connected,
      sentRequests,
      receivedRequests,
    });
  } catch (error) {
    console.error("Get Connections Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
}

/**
 * Accept or reject a connection request
 * PUT /api/v1/connections/:connectionId
 */
export async function respondConnectionRequest(req, res) {
  try {
    const userId = req.user._id;
    const { connectionId } = req.params;
    const { status } = req.body; // 'accepted' | 'rejected'

    if (!mongoose.isValidObjectId(connectionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid connection request.",
      });
    }

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be 'accepted' or 'rejected'",
      });
    }

    const connection = await ConnectionModel.findOne({
      _id: connectionId,
      toUser: userId,
      status: "pending",
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: "Connection request not found or already processed",
      });
    }

    connection.status = status;
    await connection.save();

    return res.status(200).json({
      success: true,
      message: `Connection request ${status}!`,
      connection,
    });
  } catch (error) {
    console.error("Respond Connection Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
}

/**
 * Remove or cancel a connection
 * DELETE /api/v1/connections/:connectionId
 */
export async function removeConnection(req, res) {
  try {
    const userId = req.user._id;
    const { connectionId } = req.params;

    if (!mongoose.isValidObjectId(connectionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid connection.",
      });
    }

    const connection = await ConnectionModel.findOneAndDelete({
      _id: connectionId,
      $or: [{ fromUser: userId }, { toUser: userId }],
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: "Connection not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Connection removed successfully",
    });
  } catch (error) {
    console.error("Remove Connection Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
}

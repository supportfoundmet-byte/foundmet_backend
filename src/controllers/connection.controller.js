import ConnectionModel from "../models/connection.model.js";
import UserModel from "../models/user.model.js";
import mongoose from "mongoose";
import { sendError } from "../utils/http.js";
import { logError } from "../utils/logger.js";
import { sendPushToUser } from "../utils/push.js";

function pairQuery(userA, userB) {
  return {
    $or: [
      { fromUser: userA, toUser: userB },
      { fromUser: userB, toUser: userA },
    ],
  };
}

export function mapConnectionState(connection, currentUserId) {
  if (!connection) return "NONE";
  if (connection.status === "accepted") return "CONNECTED";
  if (connection.status === "rejected") return "REJECTED";
  if (connection.status === "blocked") return "BLOCKED";
  if (connection.status === "pending") {
    return String(connection.fromUser?._id || connection.fromUser) === String(currentUserId)
      ? "PENDING_SENT"
      : "PENDING_RECEIVED";
  }
  return "NONE";
}

export function toClientStatus(state) {
  if (state === "CONNECTED") return "connected";
  if (state === "PENDING_SENT") return "pending_sent";
  if (state === "PENDING_RECEIVED") return "pending_received";
  if (state === "REJECTED") return "rejected";
  if (state === "BLOCKED") return "blocked";
  return "none";
}

async function assertActiveUser(userId) {
  return UserModel.findOne({
    _id: userId,
    isSuperAdmin: { $ne: true },
    isBlocked: { $ne: true },
    isDeleted: { $ne: true },
    hiddenFromFeed: { $ne: true },
    accountStatus: { $nin: ["banned", "suspended"] },
  }).select("name");
}

export async function sendConnectionRequest(req, res) {
  try {
    const fromUserId = req.user._id;
    const toUserId = req.params.userId;

    if (!mongoose.isValidObjectId(toUserId)) {
      return sendError(res, 400, "Invalid founder profile.", "VALIDATION_ERROR");
    }
    if (fromUserId.toString() === toUserId.toString()) {
      return sendError(res, 400, "You cannot send a connection request to yourself", "SELF_REQUEST");
    }

    const targetUser = await assertActiveUser(toUserId);
    if (!targetUser) {
      return sendError(res, 404, "Founder not found", "NOT_FOUND");
    }

    const existing = await ConnectionModel.findOne(pairQuery(fromUserId, toUserId));
    if (existing) {
      if (existing.status === "blocked") {
        return sendError(res, 403, "You cannot connect with this founder.", "BLOCKED");
      }
      if (existing.status === "accepted") {
        return res.status(200).json({
          success: true,
          message: "You are already connected with this founder.",
          connection: { _id: existing._id, status: existing.status },
          state: "CONNECTED",
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
          state: incoming ? "PENDING_RECEIVED" : "PENDING_SENT",
        });
      }
      existing.fromUser = fromUserId;
      existing.toUser = toUserId;
      existing.status = "pending";
      existing.message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 500) : "";
      await existing.save();
      return res.status(201).json({
        success: true,
        message: `Connection request sent to ${targetUser.name}!`,
        connection: existing,
        state: "PENDING_SENT",
      });
    }

    const connection = await ConnectionModel.create({
      fromUser: fromUserId,
      toUser: toUserId,
      status: "pending",
      message: typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 500) : "",
    });

    // ── Real-time notification to recipient ───────────────────────────
    const io = req.app.get("io");
    const senderName = req.user.name || "A founder";
    const senderPhoto = req.user.photo || "";
    const notifPayload = {
      type: "connection_request",
      connectionId: String(connection._id),
      fromUserId: String(fromUserId),
      fromUserName: senderName,
      fromUserPhoto: senderPhoto,
      message: connection.message,
      timestamp: connection.createdAt?.toISOString() || new Date().toISOString(),
    };

    // Socket event (in-app)
    io?.to(`user:${toUserId}`).emit("connection_request_received", notifPayload);

    // Browser push (if offline)
    sendPushToUser(toUserId, {
      title: "New Connection Request",
      body: `${senderName} wants to connect with you.`,
      icon: senderPhoto || undefined,
      url: "/dashboard/connections",
      tag: `conn-${fromUserId}`,
    }).catch((err) => logError("push_connection_request", err));

    return res.status(201).json({
      success: true,
      message: `Connection request sent to ${targetUser.name}!`,
      connection,
      state: "PENDING_SENT",
    });
  } catch (error) {
    logError("send_connection", error);
    if (error?.code === 11000) {
      return sendError(res, 409, "A connection request already exists.", "CONFLICT");
    }
    return sendError(res, 500, "Unable to send connection request. Please try again.", "INTERNAL_ERROR");
  }
}

export async function getMyConnections(req, res) {
  try {
    const userId = req.user._id;
    const connections = await ConnectionModel.find({
      $or: [{ fromUser: userId }, { toUser: userId }],
    })
      .populate({
        path: "fromUser",
        select: "name role address photo projectDetails projectStatus phoneNumber allowPhoneRequest location.city",
        match: { isSuperAdmin: { $ne: true }, isBlocked: { $ne: true }, isDeleted: { $ne: true } },
      })
      .populate({
        path: "toUser",
        select: "name role address photo projectDetails projectStatus phoneNumber allowPhoneRequest location.city",
        match: { isSuperAdmin: { $ne: true }, isBlocked: { $ne: true }, isDeleted: { $ne: true } },
      })
      .sort({ createdAt: -1 })
      .lean();

    const visibleConnections = connections.filter((connection) => connection.fromUser && connection.toUser);
    const sentRequests = visibleConnections.filter(
      (item) => String(item.fromUser?._id) === String(userId) && item.status === "pending",
    );
    const receivedRequests = visibleConnections.filter(
      (item) => String(item.toUser?._id) === String(userId) && item.status === "pending",
    );
    const connected = visibleConnections.filter((item) => item.status === "accepted");
    const blocked = visibleConnections.filter((item) => item.status === "blocked");
    const states = {};
    visibleConnections.forEach((connection) => {
      const other =
        String(connection.fromUser?._id) === String(userId) ? connection.toUser : connection.fromUser;
      if (other?._id) {
        const state = mapConnectionState(connection, userId);
        states[other._id] = {
          state,
          status: toClientStatus(state),
          connectionId: connection._id,
        };
      }
    });

    return res.status(200).json({
      success: true,
      message: "Connections loaded",
      totalCount: visibleConnections.length,
      connected,
      sentRequests,
      receivedRequests,
      blocked,
      states,
    });
  } catch (error) {
    logError("get_connections", error);
    return sendError(res, 500, "Unable to load connections right now.", "INTERNAL_ERROR");
  }
}

export async function respondConnectionRequest(req, res) {
  try {
    const userId = req.user._id;
    const { connectionId } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(connectionId)) {
      return sendError(res, 400, "Invalid connection request.", "VALIDATION_ERROR");
    }
    if (!["accepted", "rejected"].includes(status)) {
      return sendError(res, 400, "Status must be 'accepted' or 'rejected'", "VALIDATION_ERROR");
    }

    const connection = await ConnectionModel.findOne({
      _id: connectionId,
      toUser: userId,
      status: "pending",
    });
    if (!connection) {
      return sendError(res, 404, "Connection request not found or already processed", "NOT_FOUND");
    }

    connection.status = status;
    await connection.save();

    // ── Real-time notification to the original sender ─────────────────
    const io = req.app.get("io");
    const senderId = String(connection.fromUser);
    const responderName = req.user.name || "A founder";
    const responderPhoto = req.user.photo || "";
    const notifPayload = {
      type: "connection_response",
      connectionId: String(connection._id),
      responderId: String(userId),
      responderName,
      responderPhoto,
      status, // "accepted" or "rejected"
      timestamp: new Date().toISOString(),
    };

    // Socket event (in-app)
    io?.to(`user:${senderId}`).emit("connection_request_responded", notifPayload);

    // Browser push (if offline)
    if (status === "accepted") {
      sendPushToUser(senderId, {
        title: "Connection Accepted!",
        body: `${responderName} accepted your connection request.`,
        icon: responderPhoto || undefined,
        url: "/dashboard/connections",
        tag: `conn-resp-${userId}`,
      }).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: status === "accepted" ? "Connection accepted." : "Connection request declined.",
      connection,
      state: status === "accepted" ? "CONNECTED" : "REJECTED",
    });
  } catch (error) {
    logError("respond_connection", error);
    return sendError(res, 500, "Unable to update this connection request.", "INTERNAL_ERROR");
  }
}

export async function removeConnection(req, res) {
  try {
    const userId = req.user._id;
    const { connectionId } = req.params;
    if (!mongoose.isValidObjectId(connectionId)) {
      return sendError(res, 400, "Invalid connection.", "VALIDATION_ERROR");
    }
    const connection = await ConnectionModel.findOneAndDelete({
      _id: connectionId,
      $or: [{ fromUser: userId }, { toUser: userId }],
    });
    if (!connection) {
      return sendError(res, 404, "Connection not found", "NOT_FOUND");
    }
    return res.status(200).json({
      success: true,
      message: connection.status === "pending" ? "Connection request cancelled." : "Connection removed successfully",
    });
  } catch (error) {
    logError("remove_connection", error);
    return sendError(res, 500, "Unable to update this connection.", "INTERNAL_ERROR");
  }
}

export async function blockUser(req, res) {
  try {
    const fromUserId = req.user._id;
    const toUserId = req.params.userId;
    if (!mongoose.isValidObjectId(toUserId) || String(fromUserId) === String(toUserId)) {
      return sendError(res, 400, "Invalid founder profile.", "VALIDATION_ERROR");
    }
    let connection = await ConnectionModel.findOne(pairQuery(fromUserId, toUserId));
    if (connection) {
      connection.status = "blocked";
      connection.fromUser = fromUserId;
      connection.toUser = toUserId;
      await connection.save();
    } else {
      connection = await ConnectionModel.create({
        fromUser: fromUserId,
        toUser: toUserId,
        status: "blocked",
      });
    }
    return res.json({ success: true, message: "User blocked.", state: "BLOCKED", connection });
  } catch (error) {
    logError("block_user", error);
    return sendError(res, 500, "Unable to block this user.", "INTERNAL_ERROR");
  }
}

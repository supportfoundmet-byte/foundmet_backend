import mongoose from "mongoose";
import MessageModel from "../models/message.model.js";
import UserModel from "../models/user.model.js";

import {
  assertAcceptedConnection,
  roomFor,
  saveDirectMessage,
} from "../utils/chat.js";

import { sendError } from "../utils/http.js";

export async function listConversations(req, res) {
  try {
    const userId = req.user._id;

    const messages = await MessageModel.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(400)
      .lean();

    const byRoom = new Map();

    for (const message of messages) {
      if (!message.roomId) continue;

      if (!byRoom.has(message.roomId)) {
        byRoom.set(message.roomId, []);
      }

      byRoom.get(message.roomId).push(message);
    }

    const conversations = [];

    for (const [roomId, roomMessages] of byRoom) {
      const latest = roomMessages[0];

      const otherId =
        String(latest.sender) === String(userId)
          ? latest.receiver
          : latest.sender;

      const unreadCount = roomMessages.filter(
        (item) =>
          String(item.receiver) === String(userId) &&
          !item.readAt
      ).length;

      conversations.push({
        roomId,
        otherUserId: String(otherId),
        lastMessage: latest.text || "",
        lastAt: latest.createdAt,
        unreadCount,
      });
    }

    const otherUserIds = conversations.map(
      (item) => item.otherUserId
    );

    const others = await UserModel.find({
      _id: { $in: otherUserIds },
    })
      .select("name photo")
      .lean();

    const byId = Object.fromEntries(
      others.map((user) => [String(user._id), user])
    );

    const payload = conversations.map((item) => ({
      ...item,
      name: byId[item.otherUserId]?.name || "Founder",
      photo: byId[item.otherUserId]?.photo || "",
    }));

    res.set("Cache-Control", "private, no-store");

    return res.status(200).json({
      success: true,
      message: "Conversations loaded",
      conversations: payload,
      data: {
        conversations: payload,
      },
    });
  } catch (error) {
    console.error("LIST CONVERSATIONS ERROR:", error);

    return sendError(
      res,
      500,
      "Could not load conversations.",
      "CONVERSATIONS_LOAD_ERROR"
    );
  }
}

export async function listMessages(req, res) {
  try {
    const userId = req.user._id;
    const otherUserId = req.params.userId;

    if (!mongoose.isValidObjectId(otherUserId)) {
      return sendError(
        res,
        400,
        "Invalid conversation.",
        "VALIDATION_ERROR"
      );
    }

    if (String(userId) === String(otherUserId)) {
      return sendError(
        res,
        400,
        "You cannot open a conversation with yourself.",
        "VALIDATION_ERROR"
      );
    }

    const connected = await assertAcceptedConnection(
      userId,
      otherUserId
    );

    if (!connected) {
      return sendError(
        res,
        403,
        "Chat is available only after a connection is accepted.",
        "FORBIDDEN"
      );
    }

    const page = Math.max(
      1,
      Number.parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
      50,
      Math.max(
        1,
        Number.parseInt(req.query.limit, 10) || 50
      )
    );

    const roomId = roomFor(userId, otherUserId);

    const [messages, total] = await Promise.all([
      MessageModel.find({ roomId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      MessageModel.countDocuments({ roomId }),
    ]);

    const readResult = await MessageModel.updateMany(
      {
        roomId,
        receiver: userId,
        readAt: null,
      },
      {
        $set: {
          readAt: new Date(),
        },
      }
    );

    // Emit real-time read receipt to the other user
    if (readResult.modifiedCount > 0) {
      const io = req.app.get("io");
      io?.to(`user:${otherUserId}`).emit("messages_read", {
        roomId,
        readBy: String(userId),
        readAt: new Date().toISOString(),
        count: readResult.modifiedCount,
      });
    }

    const ordered = messages.reverse();

    res.set("Cache-Control", "private, no-store");

    return res.status(200).json({
      success: true,
      message: "Messages loaded",
      roomId,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),

      messages: ordered.map((message) => ({
        id: String(message._id),
        clientId: message.clientId || null,
        roomId: message.roomId,
        senderId: String(message.sender),
        receiverId: String(message.receiver),
        text: message.text,
        timestamp: message.createdAt,
        readAt: message.readAt,
      })),
    });
  } catch (error) {
    console.error("LIST MESSAGES ERROR:", error);

    return sendError(
      res,
      error.statusCode || 500,
      error.statusCode
        ? error.message
        : "Could not load messages.",
      error.errorCode || "MESSAGES_LOAD_ERROR"
    );
  }
}

export async function sendMessage(req, res) {
  try {
    const senderId = req.user._id;
    const receiverId = req.body?.receiverId;
    const text = req.body?.text;
    const clientId = req.body?.clientId;

    if (!mongoose.isValidObjectId(receiverId)) {
      return sendError(
        res,
        400,
        "Invalid recipient.",
        "VALIDATION_ERROR"
      );
    }

    if (String(senderId) === String(receiverId)) {
      return sendError(
        res,
        400,
        "You cannot send a message to yourself.",
        "VALIDATION_ERROR"
      );
    }

    if (typeof text !== "string" || !text.trim()) {
      return sendError(
        res,
        400,
        "Message text is required.",
        "VALIDATION_ERROR"
      );
    }

    if (text.trim().length > 2000) {
      return sendError(
        res,
        400,
        "Message cannot exceed 2000 characters.",
        "VALIDATION_ERROR"
      );
    }

    const payload = await saveDirectMessage({
      senderId,
      senderName: req.user.name,
      senderPhoto: req.user.photo || "",
      receiverId,
      text: text.trim(),
      clientId,
    });

    const io = req.app.get("io");

    io
      ?.to(payload.roomId)
      .to(`user:${payload.senderId}`)
      .to(`user:${payload.receiverId}`)
      .emit("receive_message", payload);

    return res.status(201).json({
      success: true,
      message: payload,
      data: {
        message: payload,
      },
    });
  } catch (error) {
    console.error("SEND MESSAGE ERROR:", error);

    return sendError(
      res,
      error.statusCode || 500,
      error.statusCode
        ? error.message
        : "Message could not be delivered.",
      error.errorCode || "MESSAGE_SEND_ERROR"
    );
  }
}
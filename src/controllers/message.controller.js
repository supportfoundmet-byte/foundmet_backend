import mongoose from "mongoose";
import MessageModel from "../models/message.model.js";
import UserModel from "../models/user.model.js";
import { assertAcceptedConnection, roomFor, saveDirectMessage } from "../utils/chat.js";
import { sendError } from "../utils/http.js";

export async function listConversations(req, res) {
  const userId = req.user._id;
  const messages = await MessageModel.find({
    $or: [{ sender: userId }, { receiver: userId }],
  })
    .sort({ createdAt: -1 })
    .limit(400)
    .lean();

  const byRoom = new Map();
  for (const message of messages) {
    if (!byRoom.has(message.roomId)) byRoom.set(message.roomId, []);
    byRoom.get(message.roomId).push(message);
  }

  const conversations = [];
  for (const [roomId, roomMessages] of byRoom) {
    const latest = roomMessages[0];
    const otherId = String(latest.sender) === String(userId) ? latest.receiver : latest.sender;
    const unreadCount = roomMessages.filter(
      (item) => String(item.receiver) === String(userId) && !item.readAt,
    ).length;
    conversations.push({
      roomId,
      otherUserId: String(otherId),
      lastMessage: latest.text,
      lastAt: latest.createdAt,
      unreadCount,
    });
  }

  const others = await UserModel.find({ _id: { $in: conversations.map((item) => item.otherUserId) } })
    .select("name photo")
    .lean();
  const byId = Object.fromEntries(others.map((user) => [String(user._id), user]));
  const payload = conversations.map((item) => ({
    ...item,
    name: byId[item.otherUserId]?.name || "Founder",
    photo: byId[item.otherUserId]?.photo || "",
  }));

  return res.json({ success: true, message: "Conversations loaded", conversations: payload, data: { conversations: payload } });
}

export async function listMessages(req, res) {
  const otherUserId = req.params.userId;
  if (!mongoose.isValidObjectId(otherUserId)) {
    return sendError(res, 400, "Invalid conversation.", "VALIDATION_ERROR");
  }
  const connected = await assertAcceptedConnection(req.user._id, otherUserId);
  if (!connected) {
    return sendError(res, 403, "Chat is available only after a connection is accepted.", "FORBIDDEN");
  }

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const roomId = roomFor(req.user._id, otherUserId);
  const [messages, total] = await Promise.all([
    MessageModel.find({ roomId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    MessageModel.countDocuments({ roomId }),
  ]);

  await MessageModel.updateMany(
    { roomId, receiver: req.user._id, readAt: null },
    { $set: { readAt: new Date() } },
  );

  res.set("Cache-Control", "private, no-store");
  const ordered = messages.reverse();
  return res.json({
    success: true,
    message: "Messages loaded",
    roomId,
    page,
    limit,
    total,
    messages: ordered.map((message) => ({
      id: String(message._id),
      roomId: message.roomId,
      senderId: String(message.sender),
      receiverId: String(message.receiver),
      text: message.text,
      timestamp: message.createdAt,
      readAt: message.readAt,
    })),
  });
}

export async function sendMessage(req, res) {
  const receiverId = req.body?.receiverId;
  const text = req.body?.text;
  const clientId = req.body?.clientId;
  if (!mongoose.isValidObjectId(receiverId)) {
    return sendError(res, 400, "Invalid recipient.", "VALIDATION_ERROR");
  }
  try {
    const payload = await saveDirectMessage({
      senderId: req.user._id,
      senderName: req.user.name,
      senderPhoto: req.user.photo || "",
      receiverId,
      text,
      clientId,
    });
    req.app.get("io")?.to(payload.roomId).to(`user:${payload.senderId}`).to(`user:${payload.receiverId}`).emit("receive_message", payload);
    return res.status(201).json({ success: true, message: payload, data: { message: payload } });
  } catch (error) {
    return sendError(
      res,
      error.statusCode || 500,
      error.statusCode ? error.message : "Message could not be delivered.",
      error.errorCode || "INTERNAL_ERROR",
    );
  }
}

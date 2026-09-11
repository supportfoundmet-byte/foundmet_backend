import mongoose from "mongoose";
import MessageModel from "../models/message.model.js";
import { assertAcceptedConnection, roomFor, saveDirectMessage } from "../utils/chat.js";

export async function listMessages(req, res) {
  const otherUserId = req.params.userId;
  if (!mongoose.isValidObjectId(otherUserId)) {
    return res.status(400).json({ success: false, message: "Invalid conversation." });
  }
  const connected = await assertAcceptedConnection(req.user._id, otherUserId);
  if (!connected) {
    return res.status(403).json({ success: false, message: "Chat is available only after a connection is accepted." });
  }

  const roomId = roomFor(req.user._id, otherUserId);
  const messages = await MessageModel.find({ roomId })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();

  res.set("Cache-Control", "private, no-store");
  return res.json({
    success: true,
    roomId,
    messages: messages.map((message) => ({
      id: String(message._id),
      roomId: message.roomId,
      senderId: String(message.sender),
      receiverId: String(message.receiver),
      text: message.text,
      timestamp: message.createdAt,
    })),
  });
}

export async function sendMessage(req, res) {
  const receiverId = req.body?.receiverId;
  const text = req.body?.text;
  const clientId = req.body?.clientId;
  if (!mongoose.isValidObjectId(receiverId)) {
    return res.status(400).json({ success: false, message: "Invalid recipient." });
  }
  try {
    const payload = await saveDirectMessage({
      senderId: req.user._id,
      senderName: req.user.name,
      senderPhoto: "",
      receiverId,
      text,
      clientId,
    });
    req.app.get("io")?.to(payload.roomId).to(`user:${payload.senderId}`).to(`user:${payload.receiverId}`).emit("receive_message", payload);
    return res.status(201).json({ success: true, message: payload });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Message could not be delivered.",
    });
  }
}

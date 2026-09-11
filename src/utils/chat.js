import ConnectionModel from "../models/connection.model.js";
import MessageModel from "../models/message.model.js";

export function roomFor(userA, userB) {
  return [String(userA), String(userB)].sort().join("_");
}

export async function assertAcceptedConnection(userId, otherUserId) {
  return ConnectionModel.exists({
    status: "accepted",
    $or: [
      { fromUser: userId, toUser: otherUserId },
      { fromUser: otherUserId, toUser: userId },
    ],
  });
}

export async function saveDirectMessage({ senderId, senderName, senderPhoto, receiverId, text, clientId = "" }) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) {
    const error = new Error("Message text is required.");
    error.statusCode = 400;
    throw error;
  }
  if (trimmed.length > 2000) {
    const error = new Error("Messages can be up to 2000 characters.");
    error.statusCode = 400;
    throw error;
  }
  if (String(senderId) === String(receiverId)) {
    const error = new Error("You cannot message yourself.");
    error.statusCode = 400;
    throw error;
  }

  const connected = await assertAcceptedConnection(senderId, receiverId);
  if (!connected) {
    const error = new Error("Chat is available only after a connection is accepted.");
    error.statusCode = 403;
    throw error;
  }

  const roomId = roomFor(senderId, receiverId);
  const saved = await MessageModel.create({
    roomId,
    sender: senderId,
    receiver: receiverId,
    text: trimmed,
    clientId: typeof clientId === "string" ? clientId.slice(0, 80) : "",
  });

  return {
    id: String(saved._id),
    clientId: saved.clientId,
    roomId,
    senderId: String(senderId),
    senderName: senderName || "Founder",
    senderPhoto: senderPhoto || "",
    receiverId: String(receiverId),
    text: trimmed,
    timestamp: saved.createdAt.toISOString(),
  };
}

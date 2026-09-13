import ConnectionModel from "../models/connection.model.js";
import MessageModel from "../models/message.model.js";
import { sanitizeText } from "./sanitize.js";

export function roomFor(userA, userB) {
  return [String(userA), String(userB)].sort().join("_");
}

export async function assertAcceptedConnection(userId, otherUserId) {
  const connection = await ConnectionModel.findOne({
    $or: [
      {
        fromUser: userId,
        toUser: otherUserId,
      },
      {
        fromUser: otherUserId,
        toUser: userId,
      },
    ],
  }).lean();

  if (!connection) return null;

  if (connection.status !== "accepted") return null;

  return connection;
}

function createChatError(message, statusCode, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

export async function saveDirectMessage({
  senderId,
  senderName = "",
  senderPhoto = "",
  receiverId,
  text,
  clientId = "",
}) {
  if (!senderId || !receiverId) {
    throw createChatError(
      "Sender and receiver are required.",
      400,
      "VALIDATION_ERROR",
    );
  }

  if (String(senderId) === String(receiverId)) {
    throw createChatError(
      "You cannot message yourself.",
      400,
      "VALIDATION_ERROR",
    );
  }

  const trimmedText = sanitizeText(String(text || ""), 2000);

  if (!trimmedText) {
    throw createChatError(
      "Message text is required.",
      400,
      "VALIDATION_ERROR",
    );
  }

  const connected = await assertAcceptedConnection(senderId, receiverId);

  if (!connected) {
    throw createChatError(
      "Chat is available only after a connection is accepted.",
      403,
      "FORBIDDEN",
    );
  }

  const roomId = roomFor(senderId, receiverId);

  const safeClientId =
    typeof clientId === "string" ? clientId.trim().slice(0, 80) : "";

  /*
   * Important:
   * If the frontend retries the same message using the same clientId,
   * return the existing message instead of creating a duplicate.
   */
  if (safeClientId) {
    const existingMessage = await MessageModel.findOne({
      sender: senderId,
      clientId: safeClientId,
    }).lean();

    if (existingMessage) {
      return {
        id: String(existingMessage._id),
        clientId: existingMessage.clientId || safeClientId,
        roomId: existingMessage.roomId,
        senderId: String(existingMessage.sender),
        senderName: senderName || "Founder",
        senderPhoto: senderPhoto || "",
        receiverId: String(existingMessage.receiver),
        text: existingMessage.text,
        timestamp: new Date(
          existingMessage.createdAt,
        ).toISOString(),
        pending: false,
        duplicate: true,
      };
    }
  }

  let saved;

  try {
    saved = await MessageModel.create({
      roomId,
      sender: senderId,
      receiver: receiverId,
      text: trimmedText,
      clientId: safeClientId,
    });
  } catch (error) {
    /*
     * Handles a duplicate-key race condition when two requests arrive
     * at exactly the same time with the same clientId.
     */
    if (error?.code === 11000 && safeClientId) {
      const existingMessage = await MessageModel.findOne({
        sender: senderId,
        clientId: safeClientId,
      }).lean();

      if (existingMessage) {
        return {
          id: String(existingMessage._id),
          clientId: existingMessage.clientId || safeClientId,
          roomId: existingMessage.roomId,
          senderId: String(existingMessage.sender),
          senderName: senderName || "Founder",
          senderPhoto: senderPhoto || "",
          receiverId: String(existingMessage.receiver),
          text: existingMessage.text,
          timestamp: new Date(
            existingMessage.createdAt,
          ).toISOString(),
          pending: false,
          duplicate: true,
        };
      }
    }

    throw error;
  }

  return {
    id: String(saved._id),
    clientId: saved.clientId || safeClientId,
    roomId: saved.roomId,
    senderId: String(saved.sender),
    senderName: senderName || "Founder",
    senderPhoto: senderPhoto || "",
    receiverId: String(saved.receiver),
    text: saved.text,
    timestamp: saved.createdAt.toISOString(),
    pending: false,
    duplicate: false,
  };
}
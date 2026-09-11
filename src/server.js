import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import UserModel from './models/user.model.js';
import ConnectionModel from './models/connection.model.js';
import { saveDirectMessage } from './utils/chat.js';
import app from './app.js';

const PORT = process.env.PORT || 4000;
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const server = http.createServer(app);
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the existing backend or set PORT to another value.`);
    process.exitCode = 1;
    return;
  }
  console.error("HTTP server error:", error);
  process.exitCode = 1;
});

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Socket origin is not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST"]
  }
});

const onlineUsers = new Map();

io.use(async (socket, next) => {
  try {
    const cookieHeader = socket.handshake.headers.cookie || "";
    const token = cookieHeader.match(/(?:^|;\s*)accessToken=([^;]+)/)?.[1];
    if (!token || !process.env.ACCESS_TOKEN_SECRET) return next(new Error("Authentication required"));
    const payload = jwt.verify(decodeURIComponent(token), process.env.ACCESS_TOKEN_SECRET);
    const user = await UserModel.findOne({ _id: payload._id, isBlocked: { $ne: true } }).select("_id name photo").lean();
    if (!user) return next(new Error("Account unavailable"));
    socket.data.user = user;
    return next();
  } catch {
    return next(new Error("Invalid session"));
  }
});

const broadcastOnlineUsers = () => {
  io.emit("online_users", [...onlineUsers.keys()]);
};

// Socket.io Real-time connection handler
io.on("connection", (socket) => {
  const userId = String(socket.data.user._id);
  socket.data.userId = userId;
  socket.join(`user:${userId}`);
  onlineUsers.set(userId, (onlineUsers.get(userId) || 0) + 1);
  broadcastOnlineUsers();
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  socket.on("register_presence", () => {
    broadcastOnlineUsers();
  });

  // Join a direct message room between two users
  socket.on("join_room", async ({ roomId }) => {
    if (typeof roomId === "string" && roomId.length <= 160) {
      const participants = roomId.split("_");
      if (participants.length !== 2 || !participants.includes(userId)) return;
      const otherUser = participants.find((id) => id !== userId);
      const connected = await ConnectionModel.exists({
        status: "accepted",
        $or: [
          { fromUser: socket.data.user._id, toUser: otherUser },
          { fromUser: otherUser, toUser: socket.data.user._id },
        ],
      });
      if (!connected) {
        socket.emit("message_error", { message: "Chat is available only after a connection is accepted." });
        return;
      }
      socket.join(roomId);
    }
  });

  socket.on("send_message", async (messageData, ack) => {
    try {
      const text = typeof messageData?.text === "string" ? messageData.text.trim() : "";
      const receiverId = messageData?.receiverId;
      if (!text || !receiverId) {
        const error = { message: "Message could not be sent." };
        if (typeof ack === "function") ack({ ok: false, ...error });
        socket.emit("message_error", error);
        return;
      }
      if (String(messageData.senderId) !== userId) {
        const error = { message: "Invalid sender." };
        if (typeof ack === "function") ack({ ok: false, ...error });
        return;
      }

      const payload = await saveDirectMessage({
        senderId: socket.data.user._id,
        senderName: socket.data.user.name,
        senderPhoto: socket.data.user.photo,
        receiverId,
        text,
        clientId: typeof messageData.id === "string" ? messageData.id.slice(0, 80) : "",
      });

      io.to(payload.roomId).to(`user:${userId}`).to(`user:${payload.receiverId}`).emit("receive_message", payload);
      if (typeof ack === "function") ack({ ok: true, payload });
    } catch (error) {
      console.error("Socket send_message error:", error);
      const response = { ok: false, message: error.statusCode ? error.message : "Message could not be delivered." };
      if (typeof ack === "function") ack(response);
      socket.emit("message_error", { message: response.message });
    }
  });

  // Handle typing state
  socket.on("typing", ({ roomId, userId, userName, isTyping }) => {
    if (typeof roomId === "string" && socket.rooms.has(roomId) && String(userId) === String(socket.data.user._id)) {
      socket.to(roomId).emit("user_typing", { userId, userName, isTyping });
    }
  });

  socket.on("disconnect", () => {
    if (socket.data.userId) {
      const count = onlineUsers.get(socket.data.userId) || 1;
      if (count <= 1) onlineUsers.delete(socket.data.userId);
      else onlineUsers.set(socket.data.userId, count - 1);
      broadcastOnlineUsers();
    }
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

app.set("io", io);

server.listen(PORT, () => {
  console.log(`FoundMet backend & Socket.IO server running on port ${PORT}`);
});

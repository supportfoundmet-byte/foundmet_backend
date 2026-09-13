import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import UserModel from './models/user.model.js';
import ConnectionModel from './models/connection.model.js';
import MessageModel from './models/message.model.js';
import CallModel from './models/call.model.js';
import { saveDirectMessage } from './utils/chat.js';
import { sendPushToUser } from './utils/push.js';
import app from './app.js';
import { isAllowedOrigin } from './config/cors.config.js';

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the existing backend or set PORT to another value.`);
    process.exitCode = 1;
    return;
  }
  console.error('HTTP server error:', error);
  process.exitCode = 1;
});

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error('Socket origin is not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
  // Improve reliability: allow both polling and websocket
  transports: ['polling', 'websocket'],
  // Ping settings for faster offline detection
  pingInterval: 25000,
  pingTimeout: 20000,
});

// ── In-memory state ─────────────────────────────────────────────────────────
const onlineUsers = new Map();  // userId → active socket count
const activeCalls = new Map();  // callId → { callerId, calleeId, callRecord_id, startedAt }

// ── Helpers ──────────────────────────────────────────────────────────────────

export function isUserOnline(userId) {
  return onlineUsers.has(String(userId));
}

export function getOnlineUserIds() {
  return [...onlineUsers.keys()];
}

/** Broadcast the full online-user list to all sockets (backward-compat) */
const broadcastOnlineUsers = () => {
  io.emit('online_users', getOnlineUserIds());
};

/**
 * Notify only the user's accepted connections when they go online/offline.
 * More efficient and more private than broadcasting to everyone.
 */
async function notifyPresenceChange(userId, status, lastSeen = null) {
  try {
    const connections = await ConnectionModel.find({
      status: 'accepted',
      $or: [{ fromUser: userId }, { toUser: userId }],
    })
      .select('fromUser toUser')
      .lean();

    for (const conn of connections) {
      const friendId =
        String(conn.fromUser) === String(userId)
          ? String(conn.toUser)
          : String(conn.fromUser);

      io.to(`user:${friendId}`).emit(
        status === 'online' ? 'user_online' : 'user_offline',
        { userId: String(userId), lastSeen },
      );
    }
  } catch (err) {
    console.error('[Socket.IO] Presence notification error:', err.message);
  }
}

/**
 * Verify two users have an accepted connection.
 * Returns true/false — never throws.
 */
async function haveAcceptedConnection(userA, userB) {
  try {
    return !!(await ConnectionModel.exists({
      status: 'accepted',
      $or: [
        { fromUser: userA, toUser: userB },
        { fromUser: userB, toUser: userA },
      ],
    }));
  } catch {
    return false;
  }
}

// ── Socket.IO auth middleware ─────────────────────────────────────────────────
io.use(async (socket, next) => {
  try {
    // Support cookie-based token (main auth) OR Bearer token in handshake auth
    const cookieHeader = socket.handshake.headers.cookie || '';
    const cookieToken = cookieHeader.match(/(?:^|;\s*)accessToken=([^;]+)/)?.[1];
    const bearerToken = socket.handshake.auth?.token;
    const token = cookieToken || bearerToken;

    if (!token || !process.env.ACCESS_TOKEN_SECRET)
      return next(new Error('Authentication required'));

    const payload = jwt.verify(
      decodeURIComponent(token),
      process.env.ACCESS_TOKEN_SECRET,
    );

    const user = await UserModel.findOne({
      _id: payload._id,
      isBlocked: { $ne: true },
      isDeleted: { $ne: true },
      accountStatus: { $nin: ['banned', 'suspended'] },
    })
      .select('_id name photo')
      .lean();

    if (!user) return next(new Error('Account unavailable'));
    socket.data.user = user;
    return next();
  } catch {
    return next(new Error('Invalid session'));
  }
});

// ── Main connection handler ───────────────────────────────────────────────────
io.on('connection', (socket) => {
  const userId = String(socket.data.user._id);
  socket.data.userId = userId;

  // Join this user's personal room so we can target them from controllers
  socket.join(`user:${userId}`);

  // Track socket count (multiple tabs = multiple sockets for same user)
  const wasOffline = !onlineUsers.has(userId);
  onlineUsers.set(userId, (onlineUsers.get(userId) || 0) + 1);

  // Tell everyone the updated online list + notify this user's friends directly
  broadcastOnlineUsers();
  if (wasOffline) {
    notifyPresenceChange(userId, 'online');
  }

  console.log(`[Socket.IO] Connected  : ${socket.id} (user: ${userId})`);

  // ─────────────────────────────────────────────────────────────────────────
  // PRESENCE
  // ─────────────────────────────────────────────────────────────────────────

  /** Client can request re-broadcast of the full online list at any time */
  socket.on('register_presence', () => {
    broadcastOnlineUsers();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CHAT — ROOM MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  socket.on('join_room', async ({ roomId }) => {
    try {
      if (typeof roomId !== 'string' || roomId.length > 160) return;

      const parts = roomId.split('_');
      if (parts.length !== 2 || !parts.includes(userId)) return;

      const otherId = parts.find((id) => id !== userId);
      if (!otherId) return;

      const ok = await haveAcceptedConnection(userId, otherId);
      if (!ok) {
        socket.emit('message_error', {
          message: 'Chat is available only after a connection is accepted.',
        });
        return;
      }

      socket.join(roomId);
    } catch (err) {
      console.error('[Socket.IO] join_room error:', err.message);
    }
  });

  socket.on('leave_room', ({ roomId }) => {
    if (typeof roomId === 'string') socket.leave(roomId);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CHAT — MESSAGING
  // ─────────────────────────────────────────────────────────────────────────

  socket.on('send_message', async (messageData, ack) => {
    try {
      const text =
        typeof messageData?.text === 'string' ? messageData.text.trim() : '';
      const receiverId = messageData?.receiverId;

      if (!text || !receiverId) {
        const err = { message: 'Message could not be sent.' };
        if (typeof ack === 'function') ack({ ok: false, ...err });
        socket.emit('message_error', err);
        return;
      }

      // Prevent spoofing senderId
      if (String(messageData.senderId) !== userId) {
        if (typeof ack === 'function') ack({ ok: false, message: 'Invalid sender.' });
        return;
      }

      const payload = await saveDirectMessage({
        senderId: socket.data.user._id,
        senderName: socket.data.user.name,
        senderPhoto: socket.data.user.photo,
        receiverId,
        text,
        clientId:
          typeof messageData.id === 'string' ? messageData.id.slice(0, 80) : '',
      });

      // Deliver to: the chat room + both users' personal rooms
      // (personal rooms ensure delivery even if the tab isn't in the chat view)
      io
        .to(payload.roomId)
        .to(`user:${userId}`)
        .to(`user:${payload.receiverId}`)
        .emit('receive_message', payload);

      if (typeof ack === 'function') ack({ ok: true, payload });

      // In-app notification for the receiver (so their UI can show a badge)
      const notif = {
        type: 'new_message',
        senderId: userId,
        senderName: socket.data.user.name || 'Founder',
        senderPhoto: socket.data.user.photo || '',
        text: text.length > 100 ? `${text.slice(0, 100)}…` : text,
        roomId: payload.roomId,
        messageId: payload.id,
        timestamp: payload.timestamp,
      };
      io.to(`user:${payload.receiverId}`).emit('new_message_notification', notif);

      // Browser push notification (only when the user is completely offline)
      if (!isUserOnline(payload.receiverId)) {
        sendPushToUser(payload.receiverId, {
          title: socket.data.user.name || 'New Message',
          body: text.length > 120 ? `${text.slice(0, 120)}…` : text,
          icon: socket.data.user.photo || undefined,
          url: `/chat/${userId}`,
          tag: `msg-${payload.roomId}`,
        }).catch((err) =>
          console.error('[Web Push] send_message push error:', err.message),
        );
      }
    } catch (error) {
      console.error('[Socket.IO] send_message error:', error);
      const response = {
        ok: false,
        message: error.statusCode
          ? error.message
          : 'Message could not be delivered.',
      };
      if (typeof ack === 'function') ack(response);
      socket.emit('message_error', { message: response.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CHAT — READ RECEIPTS
  // ─────────────────────────────────────────────────────────────────────────

  socket.on('mark_read', async ({ roomId }) => {
    try {
      if (typeof roomId !== 'string' || roomId.length > 160) return;

      const parts = roomId.split('_');
      if (parts.length !== 2 || !parts.includes(userId)) return;

      const otherUserId = parts.find((id) => id !== userId);
      const now = new Date();

      const result = await MessageModel.updateMany(
        { roomId, sender: otherUserId, receiver: userId, readAt: null },
        { $set: { readAt: now } },
      );

      if (result.modifiedCount > 0) {
        io.to(`user:${otherUserId}`).emit('messages_read', {
          roomId,
          readBy: userId,
          readAt: now.toISOString(),
          count: result.modifiedCount,
        });
      }
    } catch (err) {
      console.error('[Socket.IO] mark_read error:', err.message);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CHAT — TYPING INDICATOR
  // ─────────────────────────────────────────────────────────────────────────

  socket.on('typing', ({ roomId, userId: typingId, userName, isTyping }) => {
    if (
      typeof roomId === 'string' &&
      socket.rooms.has(roomId) &&
      String(typingId) === userId
    ) {
      socket.to(roomId).emit('user_typing', { userId: typingId, userName, isTyping });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // VIDEO CALLS — WebRTC SIGNALING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * STEP 1 — Caller initiates a call
   *
   * Client emits: call_user { calleeId, offer (SDP), callType: "video"|"audio" }
   * Server responds:
   *   → to callee:  call_incoming  { callId, callerId, callerName, callerPhoto, callType }
   *   → to caller:  call_rejected  { callId, reason: "offline" | "busy" }  (if unreachable)
   */
  socket.on('call_user', async ({ calleeId, offer, callType = 'video' }, ack) => {
    try {
      if (!calleeId || !offer) {
        if (typeof ack === 'function') ack({ ok: false, message: 'calleeId and offer are required.' });
        return;
      }
      if (String(calleeId) === userId) {
        if (typeof ack === 'function') ack({ ok: false, message: 'You cannot call yourself.' });
        return;
      }

      // Verify the two users are connected
      const ok = await haveAcceptedConnection(userId, calleeId);
      if (!ok) {
        if (typeof ack === 'function') ack({ ok: false, message: 'You can only call connected founders.' });
        return;
      }

      // Check if callee is already in an active call
      const calleeAlreadyBusy = [...activeCalls.values()].some(
        (c) => c.calleeId === String(calleeId) || c.callerId === String(calleeId),
      );

      // Save the call record as "missed" by default (updated when answered)
      const callRecord = await CallModel.create({
        caller: userId,
        callee: calleeId,
        status: calleeAlreadyBusy ? 'busy' : 'missed',
      });
      const callId = String(callRecord._id);

      if (calleeAlreadyBusy) {
        socket.emit('call_rejected', {
          callId,
          calleeId: String(calleeId),
          reason: 'busy',
        });
        if (typeof ack === 'function') ack({ ok: false, callId, reason: 'busy' });
        return;
      }

      // Track the call
      activeCalls.set(callId, {
        callerId: userId,
        calleeId: String(calleeId),
        recordId: callRecord._id,
        startedAt: null,
      });

      const callerName = socket.data.user.name || 'Founder';
      const callerPhoto = socket.data.user.photo || '';

      // Tell the callee about the incoming call
      io.to(`user:${calleeId}`).emit('call_incoming', {
        callId,
        callerId: userId,
        callerName,
        callerPhoto,
        offer,
        callType,
      });

      // Push notification if callee has tab closed / is offline
      if (!isUserOnline(calleeId)) {
        // Still notify even if not connected via socket (rare edge case)
        sendPushToUser(calleeId, {
          title: `📞 Incoming ${callType === 'audio' ? 'voice' : 'video'} call`,
          body: `${callerName} is calling you`,
          icon: callerPhoto || undefined,
          url: '/calls/incoming',
          tag: `call-${callId}`,
        }).catch(() => {});
      }

      if (typeof ack === 'function') ack({ ok: true, callId });
    } catch (err) {
      console.error('[Socket.IO] call_user error:', err);
      if (typeof ack === 'function') ack({ ok: false, message: 'Could not initiate call.' });
    }
  });

  /**
   * STEP 2a — Callee accepts the call
   *
   * Client emits: call_accepted { callId, answer (SDP) }
   * Server:
   *   → to caller:  call_accepted { callId, calleeId, answer }
   *   updates call record to status="answered", startedAt=now
   */
  socket.on('call_accepted', async ({ callId, answer }, ack) => {
    try {
      const call = activeCalls.get(callId);
      if (!call || call.calleeId !== userId) {
        if (typeof ack === 'function') ack({ ok: false, message: 'Call not found.' });
        return;
      }

      const now = new Date();
      call.startedAt = now;

      // Update the DB record
      await CallModel.findByIdAndUpdate(call.recordId, {
        status: 'answered',
        startedAt: now,
      });

      io.to(`user:${call.callerId}`).emit('call_accepted', {
        callId,
        calleeId: userId,
        answer,
      });

      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      console.error('[Socket.IO] call_accepted error:', err.message);
      if (typeof ack === 'function') ack({ ok: false, message: 'Error accepting call.' });
    }
  });

  /**
   * STEP 2b — Callee rejects the call
   *
   * Client emits: call_rejected { callId }
   * Server:
   *   → to caller:  call_rejected { callId, reason: "rejected" }
   *   updates call record to status="rejected"
   */
  socket.on('call_rejected', async ({ callId }, ack) => {
    try {
      const call = activeCalls.get(callId);
      if (!call || call.calleeId !== userId) {
        if (typeof ack === 'function') ack({ ok: false, message: 'Call not found.' });
        return;
      }

      activeCalls.delete(callId);

      await CallModel.findByIdAndUpdate(call.recordId, { status: 'rejected' });

      io.to(`user:${call.callerId}`).emit('call_rejected', {
        callId,
        reason: 'rejected',
      });

      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      console.error('[Socket.IO] call_rejected error:', err.message);
      if (typeof ack === 'function') ack({ ok: false, message: 'Error rejecting call.' });
    }
  });

  /**
   * STEP 3 — Either party ends the call
   *
   * Client emits: call_ended { callId }
   * Server:
   *   → to the other party: call_ended { callId }
   *   updates call record with endedAt and duration
   */
  socket.on('call_ended', async ({ callId }, ack) => {
    try {
      const call = activeCalls.get(callId);
      if (!call) {
        // Already cleaned up — silently OK
        if (typeof ack === 'function') ack({ ok: true });
        return;
      }

      // Only the caller or callee can end the call
      if (call.callerId !== userId && call.calleeId !== userId) {
        if (typeof ack === 'function') ack({ ok: false, message: 'Not your call.' });
        return;
      }

      activeCalls.delete(callId);

      const now = new Date();
      const duration =
        call.startedAt
          ? Math.round((now - call.startedAt) / 1000)
          : 0;

      await CallModel.findByIdAndUpdate(call.recordId, {
        status: call.startedAt ? 'ended' : 'missed',
        endedAt: now,
        duration,
      });

      const otherId =
        call.callerId === userId ? call.calleeId : call.callerId;

      io.to(`user:${otherId}`).emit('call_ended', { callId, endedBy: userId });

      if (typeof ack === 'function') ack({ ok: true, duration });
    } catch (err) {
      console.error('[Socket.IO] call_ended error:', err.message);
      if (typeof ack === 'function') ack({ ok: false, message: 'Error ending call.' });
    }
  });

  /**
   * STEP 4 — ICE candidate exchange (WebRTC connection establishment)
   *
   * Client emits: webrtc_ice_candidate { callId, candidate, targetUserId }
   * Server forwards it to targetUserId
   */
  socket.on('webrtc_ice_candidate', ({ callId, candidate, targetUserId }) => {
    try {
      const call = activeCalls.get(callId);
      if (!call) return;
      if (call.callerId !== userId && call.calleeId !== userId) return;

      io.to(`user:${targetUserId}`).emit('webrtc_ice_candidate', {
        callId,
        candidate,
        fromUserId: userId,
      });
    } catch (err) {
      console.error('[Socket.IO] webrtc_ice_candidate error:', err.message);
    }
  });

  /**
   * Forward a WebRTC offer (re-negotiation or direct offer)
   * Client emits: webrtc_offer { callId, offer, targetUserId }
   */
  socket.on('webrtc_offer', ({ callId, offer, targetUserId }) => {
    try {
      const call = activeCalls.get(callId);
      if (!call) return;
      if (call.callerId !== userId && call.calleeId !== userId) return;

      io.to(`user:${targetUserId}`).emit('webrtc_offer', {
        callId,
        offer,
        fromUserId: userId,
      });
    } catch (err) {
      console.error('[Socket.IO] webrtc_offer error:', err.message);
    }
  });

  /**
   * Forward a WebRTC answer
   * Client emits: webrtc_answer { callId, answer, targetUserId }
   */
  socket.on('webrtc_answer', ({ callId, answer, targetUserId }) => {
    try {
      const call = activeCalls.get(callId);
      if (!call) return;
      if (call.callerId !== userId && call.calleeId !== userId) return;

      io.to(`user:${targetUserId}`).emit('webrtc_answer', {
        callId,
        answer,
        fromUserId: userId,
      });
    } catch (err) {
      console.error('[Socket.IO] webrtc_answer error:', err.message);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DISCONNECT
  // ─────────────────────────────────────────────────────────────────────────

  socket.on('disconnect', async () => {
    if (!socket.data.userId) return;

    const count = onlineUsers.get(socket.data.userId) || 1;
    if (count <= 1) {
      onlineUsers.delete(socket.data.userId);

      // Persist lastSeen
      const lastSeen = new Date();
      UserModel.updateOne(
        { _id: socket.data.userId },
        { $set: { lastSeen } },
      ).catch((err) =>
        console.error('[Socket.IO] lastSeen update error:', err.message),
      );

      // End any active calls this user was part of
      for (const [callId, call] of activeCalls.entries()) {
        if (call.callerId === userId || call.calleeId === userId) {
          activeCalls.delete(callId);
          const now = new Date();
          const duration = call.startedAt
            ? Math.round((now - call.startedAt) / 1000)
            : 0;

          CallModel.findByIdAndUpdate(call.recordId, {
            status: call.startedAt ? 'ended' : 'missed',
            endedAt: now,
            duration,
          }).catch(() => {});

          const otherId = call.callerId === userId ? call.calleeId : call.callerId;
          io.to(`user:${otherId}`).emit('call_ended', {
            callId,
            endedBy: userId,
            reason: 'disconnected',
          });
        }
      }

      // Notify friends this user went offline
      notifyPresenceChange(socket.data.userId, 'offline', lastSeen.toISOString());
    } else {
      onlineUsers.set(socket.data.userId, count - 1);
    }

    broadcastOnlineUsers();
    console.log(`[Socket.IO] Disconnected: ${socket.id} (user: ${userId})`);
  });
});

// ── Make io available to Express route handlers ───────────────────────────────
app.set('io', io);
app.set('onlineUsers', onlineUsers);

// ── Start listening ───────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`FoundMet backend & Socket.IO server running on port ${PORT}`);
});

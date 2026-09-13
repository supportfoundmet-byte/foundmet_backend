import webpush from "web-push";
import PushSubscriptionModel from "../models/push-subscription.model.js";

// ── VAPID setup (lazy — env vars may not be loaded at import time) ──────
let pushReady = false;
let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:supportfoundmet@gmail.com";

  if (vapidPublicKey && vapidPrivateKey) {
    try {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      pushReady = true;
      console.log("[Web Push] VAPID configured — push notifications enabled.");
    } catch (error) {
      console.error("[Web Push] Failed to set VAPID details:", error.message);
    }
  } else {
    console.warn(
      "[Web Push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing in .env — push notifications disabled.\n" +
      "  Run: npx web-push generate-vapid-keys   and add them to .env",
    );
  }
}

export function isPushReady() {
  ensureInitialized();
  return pushReady;
}

export function getVapidPublicKey() {
  ensureInitialized();
  return process.env.VAPID_PUBLIC_KEY || "";
}

/**
 * Send a Web Push notification to every subscription the user has registered.
 *
 * @param {string} userId  — recipient Mongo _id
 * @param {object} payload — { title, body, icon?, url?, tag? }
 */
export async function sendPushToUser(userId, payload) {
  ensureInitialized();
  if (!pushReady) return;

  const subscriptions = await PushSubscriptionModel.find({ userId }).lean();
  if (!subscriptions.length) return;

  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body,
          { TTL: 60 * 60 }, // 1 hour
        )
        .catch(async (error) => {
          // 410 Gone or 404 — subscription expired / unsubscribed
          if (error.statusCode === 410 || error.statusCode === 404) {
            await PushSubscriptionModel.deleteOne({ _id: sub._id }).catch(() => {});
          }
          throw error;
        }),
    ),
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  if (sent > 0) {
    console.log(`[Web Push] Sent ${sent}/${subscriptions.length} notification(s) to user ${userId}`);
  }
}

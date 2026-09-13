import express from "express";
import { verifyAuth } from "../middleware/auth.middleware.js";
import PushSubscriptionModel from "../models/push-subscription.model.js";
import { getVapidPublicKey, isPushReady } from "../utils/push.js";
import { sendError } from "../utils/http.js";

const router = express.Router();

// Public — the frontend needs the VAPID public key before the user logs in
router.get("/vapid-key", (req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    return sendError(res, 503, "Push notifications are not configured.", "PUSH_UNAVAILABLE");
  }
  return res.json({ success: true, vapidPublicKey: key });
});

// Protected — save / remove push subscriptions
router.use(verifyAuth);

/**
 * POST /api/v1/push/subscribe
 * Body: { endpoint, keys: { p256dh, auth } }
 */
router.post("/subscribe", async (req, res) => {
  try {
    if (!isPushReady()) {
      return sendError(res, 503, "Push notifications are not configured.", "PUSH_UNAVAILABLE");
    }

    const { endpoint, keys } = req.body || {};

    if (
      typeof endpoint !== "string" ||
      !endpoint.startsWith("https://") ||
      typeof keys?.p256dh !== "string" ||
      typeof keys?.auth !== "string"
    ) {
      return sendError(res, 400, "Invalid push subscription.", "VALIDATION_ERROR");
    }

    // Upsert — if the same browser endpoint exists, just update the userId & keys
    await PushSubscriptionModel.findOneAndUpdate(
      { endpoint },
      { userId: req.user._id, endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      { upsert: true, new: true },
    );

    return res.status(201).json({ success: true, message: "Push subscription saved." });
  } catch (error) {
    console.error("PUSH SUBSCRIBE ERROR:", error);
    return sendError(res, 500, "Could not save push subscription.", "PUSH_SUBSCRIBE_ERROR");
  }
});

/**
 * DELETE /api/v1/push/subscribe
 * Body: { endpoint }
 */
router.delete("/subscribe", async (req, res) => {
  try {
    const { endpoint } = req.body || {};

    if (typeof endpoint !== "string") {
      return sendError(res, 400, "Endpoint is required.", "VALIDATION_ERROR");
    }

    await PushSubscriptionModel.deleteOne({ userId: req.user._id, endpoint });

    return res.json({ success: true, message: "Push subscription removed." });
  } catch (error) {
    console.error("PUSH UNSUBSCRIBE ERROR:", error);
    return sendError(res, 500, "Could not remove push subscription.", "PUSH_UNSUBSCRIBE_ERROR");
  }
});

export default router;

import express from "express";
import { listMessages, sendMessage } from "../controllers/message.controller.js";
import { verifyAuth } from "../middleware/auth.middleware.js";
import { createRateLimiter } from "../middleware/rate-limit.middleware.js";

const router = express.Router();
router.use(verifyAuth);
router.post("/", createRateLimiter({ windowMs: 60_000, max: 60, message: "Too many messages. Please wait a moment." }), sendMessage);
router.get("/:userId", listMessages);

export default router;

import express from "express";
import {
  sendConnectionRequest,
  getMyConnections,
  respondConnectionRequest,
  removeConnection,
  blockUser,
} from "../controllers/connection.controller.js";
import { verifyAuth } from "../middleware/auth.middleware.js";
import { createRateLimiter } from "../middleware/rate-limit.middleware.js";

const router = express.Router();
router.use(verifyAuth);
router.post("/request/:userId", createRateLimiter({ windowMs: 60_000, max: 20, message: "Too many connection requests. Please try again shortly." }), sendConnectionRequest);
router.post("/block/:userId", createRateLimiter({ windowMs: 60_000, max: 20 }), blockUser);
router.get("/", getMyConnections);
router.put("/:connectionId", respondConnectionRequest);
router.delete("/:connectionId", removeConnection);

export default router;

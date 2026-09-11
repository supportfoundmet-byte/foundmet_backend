import express from "express";
import {
  sendConnectionRequest,
  getMyConnections,
  respondConnectionRequest,
  removeConnection,
} from "../controllers/connection.controller.js";
import { verifyAuth } from "../middleware/auth.middleware.js";
import { createRateLimiter } from "../middleware/rate-limit.middleware.js";

const router = express.Router();

// All connection routes require authentication
router.use(verifyAuth);

/** POST /api/v1/connections/request/:userId */
router.post("/request/:userId", createRateLimiter({ windowMs: 60_000, max: 20, message: "Too many connection requests. Please try again shortly." }), sendConnectionRequest);

/** GET /api/v1/connections */
router.get("/", getMyConnections);

/** PUT /api/v1/connections/:connectionId */
router.put("/:connectionId", respondConnectionRequest);

/** DELETE /api/v1/connections/:connectionId */
router.delete("/:connectionId", removeConnection);

export default router;

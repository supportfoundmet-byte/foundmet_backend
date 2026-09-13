import express from "express";
import { listCalls, missedCallCount, deleteCall } from "../controllers/call.controller.js";
import { verifyAuth } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(verifyAuth);

// GET /api/v1/calls           — recent call history
router.get("/", listCalls);

// GET /api/v1/calls/missed-count  — badge count of missed calls
router.get("/missed-count", missedCallCount);

// DELETE /api/v1/calls/:callId   — remove a call from history
router.delete("/:callId", deleteCall);

export default router;

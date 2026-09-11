import express from "express";
import { reportUser } from "../controllers/report.controller.js";
import { verifyAuth } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(verifyAuth);
router.post("/:userId", reportUser);

export default router;

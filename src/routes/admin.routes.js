import express from "express";
import { adminLogin, adminLogout, adminSession, listAdminData, systemStatus, createSuperAdmin, moderateAdmin, moderateUser, moderateReport, congratulateUser, deletePost, listAuditLogs } from "../controllers/admin.controller.js";
import { verifySuperAdmin, requireAdminRole } from "../middleware/admin.middleware.js";
import { createRateLimiter } from "../middleware/rate-limit.middleware.js";

const router = express.Router();
const adminMutationLimiter = createRateLimiter({ windowMs: 60_000, max: 30, message: "Too many administrative actions. Please slow down." });
router.post("/login", createRateLimiter({ windowMs: 15 * 60_000, max: 10, message: "Too many Superadmin login attempts. Please try again later." }), adminLogin);
router.post("/logout", verifySuperAdmin, adminLogout);
router.use(verifySuperAdmin);
router.get("/session", adminSession);
router.get("/data", listAdminData);
router.get("/status", systemStatus);
router.get("/audit-logs", requireAdminRole("SUPER_ADMIN", "ADMIN"), listAuditLogs);
router.post("/admins", adminMutationLimiter, requireAdminRole("SUPER_ADMIN", "ADMIN"), createSuperAdmin);
router.patch("/admins/:adminId", adminMutationLimiter, requireAdminRole("SUPER_ADMIN"), moderateAdmin);
router.patch("/users/:userId", adminMutationLimiter, moderateUser);
router.patch("/reports/:reportId", adminMutationLimiter, moderateReport);
router.delete("/posts/:postId", adminMutationLimiter, deletePost);
router.post("/users/:userId/congratulate", adminMutationLimiter, congratulateUser);

export default router;

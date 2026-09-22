import express from "express";
import { verifyAuth, optionalAuth } from "../middleware/auth.middleware.js";
import {
  createPost,
  deletePost,
  editPost,
  listPosts,
  toggleLike,
  sharePost,
  listComments,
  addComment,
  deleteComment,
} from "../controllers/post.controller.js";

const router = express.Router();

// Public routes with optional auth (for detecting liked status)
router.get("/", optionalAuth, listPosts);
router.get("/:postId/comments", optionalAuth, listComments);

// Protected routes (require authenticated session)
router.post("/", verifyAuth, createPost);
router.put("/:postId", verifyAuth, editPost);
router.delete("/:postId", verifyAuth, deletePost);
router.post("/:postId/like", verifyAuth, toggleLike);
router.post("/:postId/share", verifyAuth, sharePost);

router.post("/:postId/comments", verifyAuth, addComment);
router.delete("/:postId/comments/:commentId", verifyAuth, deleteComment);

export default router;

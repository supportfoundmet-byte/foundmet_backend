import express from "express";
import { verifyAuth } from "../middleware/auth.middleware.js";
import { createPost, deletePost, listPosts, toggleLike } from "../controllers/post.controller.js";

const router = express.Router();
router.use(verifyAuth);
router.get("/", listPosts);
router.post("/", createPost);
router.delete("/:postId", deletePost);
router.post("/:postId/like", toggleLike);

export default router;

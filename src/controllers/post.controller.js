import mongoose from "mongoose";
import PostModel from "../models/post.model.js";

const postProjection = "text likes author createdAt updatedAt";

export async function listPosts(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20),
    );
    const filter = {};
    // req.user may legitimately be absent here — viewing the feed does not
    // require sign-in. Only liking/sharing does, so this must never throw
    // for an anonymous request.
    const viewerId = req.user?._id ? String(req.user._id) : null;

    const [posts, total] = await Promise.all([
      PostModel.find(filter)
        .populate({
          path: "author",
          match: {
            isSuperAdmin: { $ne: true },
            isBlocked: { $ne: true },
            hiddenFromFeed: { $ne: true },
            isDeleted: { $ne: true },
          },
          select: "name photo",
        })
        .select(postProjection)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PostModel.countDocuments(filter),
    ]);
    res.set("Cache-Control", "private, no-store");
    const visiblePosts = posts.filter((post) => post.author);
    return res.json({
      success: true,
      message: "Posts loaded",
      page,
      limit,
      total,
      posts: visiblePosts.map((post) => ({
        ...post,
        likeCount: post.likes.length,
        liked: viewerId
          ? post.likes.some((id) => String(id) === viewerId)
          : false,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to load posts right now. Please try again.",
    });
  }
}

export async function createPost(req, res) {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text || text.length > 1000)
    return res.status(400).json({
      success: false,
      message: "Post text must be between 1 and 1000 characters.",
    });
  const post = await PostModel.create({ author: req.user._id, text });
  const populated = await post.populate("author", "name photo");
  return res.status(201).json({
    success: true,
    post: { ...populated.toObject(), likeCount: 0, liked: false },
  });
}

export async function deletePost(req, res) {
  if (!mongoose.isValidObjectId(req.params.postId))
    return res.status(400).json({ success: false, message: "Invalid post." });
  const post = await PostModel.findOneAndDelete({
    _id: req.params.postId,
    author: req.user._id,
  }).lean();
  if (!post)
    return res.status(404).json({
      success: false,
      message: "Post not found or you do not own it.",
    });
  return res.json({ success: true });
}

export async function toggleLike(req, res) {
  if (!mongoose.isValidObjectId(req.params.postId))
    return res.status(400).json({ success: false, message: "Invalid post." });
  const post = await PostModel.findById(req.params.postId).select("likes");
  if (!post)
    return res.status(404).json({ success: false, message: "Post not found." });
  const userId = String(req.user._id);
  const liked = post.likes.some((id) => String(id) === userId);
  await PostModel.updateOne(
    { _id: post._id },
    liked
      ? { $pull: { likes: req.user._id } }
      : { $addToSet: { likes: req.user._id } },
  );
  return res.json({
    success: true,
    liked: !liked,
    likeCount: post.likes.length + (liked ? -1 : 1),
  });
}
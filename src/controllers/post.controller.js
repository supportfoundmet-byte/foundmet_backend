import mongoose from "mongoose";
import PostModel from "../models/post.model.js";
import CommentModel from "../models/comment.model.js";
import { sendError } from "../utils/http.js";

const postAuthorProjection = "name photo role matchRole location projectStatus isVerified";

export async function listPosts(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 15),
    );
    const category =
      typeof req.query.category === "string" && req.query.category.trim()
        ? req.query.category.trim()
        : null;
    const search =
      typeof req.query.search === "string" && req.query.search.trim()
        ? req.query.search.trim().slice(0, 80)
        : "";

    const filter = {
      status: { $ne: "hidden" },
    };

    if (category && category !== "all") {
      filter.category = category;
    }

    if (search) {
      filter.text = {
        $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };
    }

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
          select: postAuthorProjection,
        })
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
      pages: Math.ceil(total / limit) || 1,
      posts: visiblePosts.map((post) => ({
        ...post,
        likeCount: post.likesCount ?? (post.likes ? post.likes.length : 0),
        commentsCount: post.commentsCount || 0,
        sharesCount: post.sharesCount || 0,
        liked: viewerId
          ? (post.likes || []).some((id) => String(id) === viewerId)
          : false,
      })),
    });
  } catch (error) {
    console.error("LIST POSTS ERROR:", error);
    return sendError(
      res,
      500,
      "Unable to load posts right now. Please try again.",
      "INTERNAL_ERROR",
    );
  }
}

export async function createPost(req, res) {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const category =
      typeof req.body?.category === "string" &&
      ["general", "seeking_cofounder", "milestone", "idea", "tech"].includes(
        req.body.category,
      )
        ? req.body.category
        : "general";

    const mediaUrl =
      typeof req.body?.mediaUrl === "string" ? req.body.mediaUrl.trim() : "";

    if (!text || text.length > 2000) {
      return sendError(
        res,
        400,
        "Post text must be between 1 and 2000 characters.",
        "VALIDATION_ERROR",
      );
    }

    const postData = {
      author: req.user._id,
      text,
      category,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      status: "active",
      media: {
        url: mediaUrl,
        type: mediaUrl ? "image" : "none",
      },
    };

    const post = await PostModel.create(postData);
    const populated = await post.populate("author", postAuthorProjection);

    return res.status(201).json({
      success: true,
      message: "Post created successfully",
      post: {
        ...populated.toObject(),
        likeCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        liked: false,
      },
    });
  } catch (error) {
    console.error("CREATE POST ERROR:", error);
    return sendError(
      res,
      500,
      "Unable to create post right now.",
      "POST_CREATE_ERROR",
    );
  }
}

export async function editPost(req, res) {
  try {
    const { postId } = req.params;
    if (!mongoose.isValidObjectId(postId)) {
      return sendError(res, 400, "Invalid post ID.", "VALIDATION_ERROR");
    }

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > 2000) {
      return sendError(
        res,
        400,
        "Post text must be between 1 and 2000 characters.",
        "VALIDATION_ERROR",
      );
    }

    const post = await PostModel.findById(postId);
    if (!post) {
      return sendError(res, 404, "Post not found.", "NOT_FOUND");
    }

    if (String(post.author) !== String(req.user._id)) {
      return sendError(
        res,
        403,
        "You do not have permission to edit this post.",
        "FORBIDDEN",
      );
    }

    post.text = text;
    if (
      req.body.category &&
      ["general", "seeking_cofounder", "milestone", "idea", "tech"].includes(
        req.body.category,
      )
    ) {
      post.category = req.body.category;
    }
    if (typeof req.body.mediaUrl === "string") {
      post.media = {
        url: req.body.mediaUrl.trim(),
        type: req.body.mediaUrl.trim() ? "image" : "none",
      };
    }

    await post.save();
    const populated = await post.populate("author", postAuthorProjection);

    return res.json({
      success: true,
      message: "Post updated",
      post: {
        ...populated.toObject(),
        likeCount: post.likesCount,
        liked: (post.likes || []).some(
          (id) => String(id) === String(req.user._id),
        ),
      },
    });
  } catch (error) {
    console.error("EDIT POST ERROR:", error);
    return sendError(
      res,
      500,
      "Unable to update post.",
      "POST_UPDATE_ERROR",
    );
  }
}

export async function deletePost(req, res) {
  try {
    const { postId } = req.params;
    if (!mongoose.isValidObjectId(postId)) {
      return sendError(res, 400, "Invalid post ID.", "VALIDATION_ERROR");
    }

    const post = await PostModel.findById(postId);
    if (!post) {
      return sendError(res, 404, "Post not found.", "NOT_FOUND");
    }

    const isAuthor = String(post.author) === String(req.user._id);
    const isAdmin =
      req.user.adminRole === "admin" || req.user.adminRole === "superadmin";

    if (!isAuthor && !isAdmin) {
      return sendError(
        res,
        403,
        "You do not have permission to delete this post.",
        "FORBIDDEN",
      );
    }

    await Promise.all([
      PostModel.findByIdAndDelete(postId),
      CommentModel.deleteMany({ post: postId }),
    ]);

    return res.json({
      success: true,
      message: "Post and its comments deleted successfully.",
      postId,
    });
  } catch (error) {
    console.error("DELETE POST ERROR:", error);
    return sendError(
      res,
      500,
      "Unable to delete post.",
      "POST_DELETE_ERROR",
    );
  }
}

export async function toggleLike(req, res) {
  try {
    const { postId } = req.params;
    if (!mongoose.isValidObjectId(postId)) {
      return sendError(res, 400, "Invalid post ID.", "VALIDATION_ERROR");
    }

    const post = await PostModel.findById(postId).select("likes likesCount");
    if (!post) {
      return sendError(res, 404, "Post not found.", "NOT_FOUND");
    }

    const userId = String(req.user._id);
    const liked = (post.likes || []).some((id) => String(id) === userId);

    let updatedPost;
    if (liked) {
      updatedPost = await PostModel.findByIdAndUpdate(
        postId,
        {
          $pull: { likes: req.user._id },
          $inc: { likesCount: -1 },
        },
        { new: true },
      ).select("likesCount likes");
    } else {
      updatedPost = await PostModel.findByIdAndUpdate(
        postId,
        {
          $addToSet: { likes: req.user._id },
          $inc: { likesCount: 1 },
        },
        { new: true },
      ).select("likesCount likes");
    }

    // Ensure likesCount is never negative
    const safeCount = Math.max(0, updatedPost.likesCount || 0);
    if (updatedPost.likesCount < 0) {
      await PostModel.updateOne({ _id: postId }, { $set: { likesCount: 0 } });
    }

    return res.json({
      success: true,
      liked: !liked,
      likeCount: safeCount,
    });
  } catch (error) {
    console.error("TOGGLE LIKE ERROR:", error);
    return sendError(
      res,
      500,
      "Unable to update like.",
      "LIKE_ERROR",
    );
  }
}

export async function sharePost(req, res) {
  try {
    const { postId } = req.params;
    if (!mongoose.isValidObjectId(postId)) {
      return sendError(res, 400, "Invalid post ID.", "VALIDATION_ERROR");
    }

    const updated = await PostModel.findByIdAndUpdate(
      postId,
      { $inc: { sharesCount: 1 } },
      { new: true },
    ).select("sharesCount");

    if (!updated) {
      return sendError(res, 404, "Post not found.", "NOT_FOUND");
    }

    return res.json({
      success: true,
      message: "Post shared successfully",
      sharesCount: updated.sharesCount,
    });
  } catch (error) {
    console.error("SHARE POST ERROR:", error);
    return sendError(
      res,
      500,
      "Unable to share post.",
      "SHARE_ERROR",
    );
  }
}

// ── COMMENT HANDLERS ─────────────────────────────────────────────────────────

export async function listComments(req, res) {
  try {
    const { postId } = req.params;
    if (!mongoose.isValidObjectId(postId)) {
      return sendError(res, 400, "Invalid post ID.", "VALIDATION_ERROR");
    }

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20),
    );

    const [comments, total] = await Promise.all([
      CommentModel.find({ post: postId, status: "active" })
        .populate("author", "name photo role matchRole")
        .sort({ createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CommentModel.countDocuments({ post: postId, status: "active" }),
    ]);

    const visibleComments = comments.filter((c) => c.author);

    res.set("Cache-Control", "private, no-store");
    return res.json({
      success: true,
      comments: visibleComments,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error("LIST COMMENTS ERROR:", error);
    return sendError(
      res,
      500,
      "Unable to load comments.",
      "COMMENTS_LOAD_ERROR",
    );
  }
}

export async function addComment(req, res) {
  try {
    const { postId } = req.params;
    if (!mongoose.isValidObjectId(postId)) {
      return sendError(res, 400, "Invalid post ID.", "VALIDATION_ERROR");
    }

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > 1000) {
      return sendError(
        res,
        400,
        "Comment text must be between 1 and 1000 characters.",
        "VALIDATION_ERROR",
      );
    }

    const post = await PostModel.findById(postId).select("_id commentsCount");
    if (!post) {
      return sendError(res, 404, "Post not found.", "NOT_FOUND");
    }

    const comment = await CommentModel.create({
      post: postId,
      author: req.user._id,
      text,
    });

    await PostModel.findByIdAndUpdate(postId, {
      $inc: { commentsCount: 1 },
    });

    const populated = await comment.populate(
      "author",
      "name photo role matchRole",
    );

    return res.status(201).json({
      success: true,
      message: "Comment added",
      comment: populated,
      commentsCount: (post.commentsCount || 0) + 1,
    });
  } catch (error) {
    console.error("ADD COMMENT ERROR:", error);
    return sendError(
      res,
      500,
      "Unable to add comment.",
      "COMMENT_ADD_ERROR",
    );
  }
}

export async function deleteComment(req, res) {
  try {
    const { postId, commentId } = req.params;
    if (
      !mongoose.isValidObjectId(postId) ||
      !mongoose.isValidObjectId(commentId)
    ) {
      return sendError(res, 400, "Invalid IDs provided.", "VALIDATION_ERROR");
    }

    const comment = await CommentModel.findById(commentId);
    if (!comment || String(comment.post) !== String(postId)) {
      return sendError(res, 404, "Comment not found.", "NOT_FOUND");
    }

    const post = await PostModel.findById(postId).select("author");
    const isCommentAuthor = String(comment.author) === String(req.user._id);
    const isPostAuthor = post && String(post.author) === String(req.user._id);
    const isAdmin =
      req.user.adminRole === "admin" || req.user.adminRole === "superadmin";

    if (!isCommentAuthor && !isPostAuthor && !isAdmin) {
      return sendError(
        res,
        403,
        "You do not have permission to delete this comment.",
        "FORBIDDEN",
      );
    }

    await CommentModel.findByIdAndDelete(commentId);
    const updatedPost = await PostModel.findByIdAndUpdate(
      postId,
      { $inc: { commentsCount: -1 } },
      { new: true },
    ).select("commentsCount");

    return res.json({
      success: true,
      message: "Comment deleted",
      commentId,
      commentsCount: Math.max(0, updatedPost?.commentsCount || 0),
    });
  } catch (error) {
    console.error("DELETE COMMENT ERROR:", error);
    return sendError(
      res,
      500,
      "Unable to delete comment.",
      "COMMENT_DELETE_ERROR",
    );
  }
}
import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: [true, "Post text is required"],
      trim: true,
      minlength: 1,
      maxlength: 2000,
    },
    media: {
      url: { type: String, trim: true, default: "" },
      type: {
        type: String,
        enum: ["image", "none"],
        default: "none",
      },
    },
    category: {
      type: String,
      enum: ["general", "seeking_cofounder", "milestone", "idea", "tech"],
      default: "general",
      index: true,
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    likesCount: { type: Number, default: 0, min: 0, index: true },
    commentsCount: { type: Number, default: 0, min: 0 },
    sharesCount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["active", "hidden", "flagged"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

postSchema.index({ createdAt: -1 });
postSchema.index({ category: 1, createdAt: -1 });

const PostModel = mongoose.models.Post || mongoose.model("Post", postSchema);

export default PostModel;

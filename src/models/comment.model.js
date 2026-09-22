import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: [true, "Comment text is required"],
      trim: true,
      minlength: 1,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ["active", "hidden"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

commentSchema.index({ post: 1, createdAt: 1 });

const CommentModel =
  mongoose.models.Comment || mongoose.model("Comment", commentSchema);

export default CommentModel;

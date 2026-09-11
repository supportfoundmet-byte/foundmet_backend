import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema(
  {
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stars: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    feedback: {
      type: String,
      maxlength: 1000,
      trim: true,
      default: "",
    },
    tags: [
      {
        type: String,
        enum: [
          "Technical Wizard",
          "Visionary Leader",
          "Great Communicator",
          "Reliable Builder",
          "Fast Execution",
        ],
      },
    ],
  },
  {
    timestamps: true,
  }
);

// One review per user per founder
ratingSchema.index({ fromUser: 1, targetUser: 1 }, { unique: true });
ratingSchema.index({ targetUser: 1, createdAt: -1 });

const RatingModel = mongoose.model("Rating", ratingSchema);

export default RatingModel;

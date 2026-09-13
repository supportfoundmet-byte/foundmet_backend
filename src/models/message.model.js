import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
      maxlength: 160,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    clientId: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },

    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Load messages in chronological order
messageSchema.index({
  roomId: 1,
  createdAt: -1,
});

// Useful for sender/receiver queries
messageSchema.index({
  sender: 1,
  receiver: 1,
  createdAt: -1,
});

// Prevent the same sender from saving the same client message twice
messageSchema.index(
  {
    sender: 1,
    clientId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      clientId: {
        $type: "string",
        $ne: "",
      },
    },
  },
);

const MessageModel =
  mongoose.models.Message ||
  mongoose.model("Message", messageSchema);

export default MessageModel;
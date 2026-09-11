import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true, maxlength: 160 },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    clientId: { type: String, trim: true, maxlength: 80, default: "" },
  },
  { timestamps: true },
);

messageSchema.index({ roomId: 1, createdAt: -1 });
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

export default mongoose.model("Message", messageSchema);

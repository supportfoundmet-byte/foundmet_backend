import ConnectionModel from "../models/connection.model.js";
import MessageModel from "../models/message.model.js";
import PostModel from "../models/post.model.js";
import RatingModel from "../models/rating.model.js";
import ReportModel from "../models/report.model.js";
import UserModel from "../models/user.model.js";
import CommentModel from "../models/comment.model.js";
import CallModel from "../models/call.model.js";
import PushSubscriptionModel from "../models/push-subscription.model.js";

export async function purgeUserById(userId) {
  await Promise.all([
    ConnectionModel.deleteMany({ $or: [{ fromUser: userId }, { toUser: userId }] }),
    MessageModel.deleteMany({ $or: [{ sender: userId }, { receiver: userId }] }),
    PostModel.deleteMany({ author: userId }),
    PostModel.updateMany({ likes: userId }, { $pull: { likes: userId }, $inc: { likesCount: -1 } }),
    CommentModel.deleteMany({ author: userId }),
    RatingModel.deleteMany({ $or: [{ fromUser: userId }, { targetUser: userId }] }),
    ReportModel.deleteMany({ $or: [{ reporter: userId }, { targetUser: userId }] }),
    CallModel.deleteMany({ $or: [{ caller: userId }, { callee: userId }] }),
    PushSubscriptionModel.deleteMany({ userId }),
  ]);
  return UserModel.findOneAndDelete({ _id: userId, isSuperAdmin: { $ne: true } });
}


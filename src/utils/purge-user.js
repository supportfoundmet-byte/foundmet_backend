import ConnectionModel from "../models/connection.model.js";
import MessageModel from "../models/message.model.js";
import PostModel from "../models/post.model.js";
import RatingModel from "../models/rating.model.js";
import ReportModel from "../models/report.model.js";
import UserModel from "../models/user.model.js";

export async function purgeUserById(userId) {
  await Promise.all([
    ConnectionModel.deleteMany({ $or: [{ fromUser: userId }, { toUser: userId }] }),
    MessageModel.deleteMany({ $or: [{ sender: userId }, { receiver: userId }] }),
    PostModel.deleteMany({ author: userId }),
    RatingModel.deleteMany({ $or: [{ fromUser: userId }, { targetUser: userId }] }),
    ReportModel.deleteMany({ $or: [{ reporter: userId }, { targetUser: userId }] }),
  ]);
  return UserModel.findOneAndDelete({ _id: userId, isSuperAdmin: { $ne: true } });
}

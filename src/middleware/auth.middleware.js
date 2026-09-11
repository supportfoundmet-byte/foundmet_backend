import jwt from "jsonwebtoken";
import UserModel from "../models/user.model.js";
import { sendError } from "../utils/http.js";
import { logWarn } from "../utils/logger.js";

export const verifyAuth = (req, res, next) => {
  try {
    if (!process.env.ACCESS_TOKEN_SECRET) {
      return sendError(res, 503, "Authentication service is not configured.", "AUTH_UNAVAILABLE");
    }

    const authHeader = req.headers.authorization;
    const token =
      req.cookies?.accessToken ||
      (authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : null) ||
      req.headers["x-access-token"];

    if (!token) {
      return sendError(res, 401, "Authentication required. Please log in or create an account.", "UNAUTHENTICATED");
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (!decoded?._id) {
      return sendError(res, 403, "Invalid or expired session. Please log in again.", "INVALID_SESSION");
    }

    UserModel.findById(decoded._id)
      .select("isBlocked isDeleted accountStatus name email role photo")
      .lean()
      .then((user) => {
        if (!user || user.isDeleted) {
          return sendError(res, 403, "This account is no longer available.", "ACCOUNT_UNAVAILABLE");
        }
        if (user.isBlocked || user.accountStatus === "banned") {
          return sendError(res, 403, "This account has been banned.", "ACCOUNT_BANNED");
        }
        if (user.accountStatus === "suspended") {
          return sendError(res, 403, "This account is suspended. Contact FoundMet support.", "ACCOUNT_SUSPENDED");
        }
        req.user = { ...decoded, name: user.name, email: user.email, photo: user.photo };
        next();
      })
      .catch(() => sendError(res, 503, "Authentication service is temporarily unavailable.", "AUTH_UNAVAILABLE"));
  } catch {
    logWarn("auth_failure", { path: req.path });
    return sendError(res, 403, "Invalid or expired session. Please log in again.", "INVALID_SESSION");
  }
};

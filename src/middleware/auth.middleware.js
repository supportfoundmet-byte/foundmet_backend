import jwt from "jsonwebtoken";
import UserModel from "../models/user.model.js";

/**
 * Authentication Middleware to verify JWT token
 * Prevents unauthorized requests from unauthenticated clients
 */
export const verifyAuth = (req, res, next) => {
  try {
    if (!process.env.ACCESS_TOKEN_SECRET) {
      return res.status(503).json({
        success: false,
        message: "Authentication service is not configured.",
      });
    }

    const authHeader = req.headers.authorization;
    const token =
      req.cookies?.accessToken ||
      (authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : null) ||
      req.headers["x-access-token"];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please log in or create an account.",
      });
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (!decoded?._id) {
      return res.status(403).json({
        success: false,
        message: "Invalid or expired session. Please log in again.",
      });
    }

    UserModel.findById(decoded._id).select("isBlocked").lean()
      .then((user) => {
        if (!user || user.isBlocked) {
          return res.status(403).json({ success: false, message: "This account is blocked or no longer available." });
        }
        req.user = decoded;
        next();
      })
      .catch(() => res.status(503).json({ success: false, message: "Authentication service is temporarily unavailable." }));
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: "Invalid or expired session. Please log in again.",
    });
  }
};

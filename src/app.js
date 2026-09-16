import dotenv from "dotenv";
dotenv.config({
  path: ".env",
});

import express from "express";
import morgan from "morgan";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import connectionDb from "./config/db.config.js";
import authRouter from "./routes/auth.routes.js";
import feedRouter from "./routes/feed.routes.js";
import connectionRouter from "./routes/connection.routes.js";
import ratingRouter from "./routes/rating.routes.js";
import reportRouter from "./routes/report.routes.js";
import adminRouter from "./routes/admin.routes.js";
import postRouter from "./routes/post.routes.js";
import messageRouter from "./routes/message.routes.js";
import pushRouter from "./routes/push.routes.js";
import callRouter from "./routes/call.routes.js";
import { createRateLimiter } from "./middleware/rate-limit.middleware.js";
import { isAllowedOrigin } from "./config/cors.config.js";
import { sendError } from "./utils/http.js";
import { createLogStream, logError } from "./utils/logger.js";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }),
);
app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
    stream: createLogStream(),
  }),
);
app.use(
  cors({
    origin: (origin, callback) => {
      return callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  }),
);
app.use(createRateLimiter({ windowMs: 60_000, max: 180 }));

connectionDb().catch(() => {});

app.get("/health", (req, res) => {
  const healthy = mongoose.connection.readyState === 1;
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? "healthy" : "degraded",
    database: healthy ? "connected" : "unavailable",
  });
});

app.use(
  "/auth",
  createRateLimiter({
    windowMs: 15 * 60_000,
    max: 40,
    message: "Too many authentication attempts. Please try again later.",
  }),
  authRouter,
);
app.use("/api/v1", feedRouter);
app.use("/api/v1/connections", connectionRouter);
app.use("/api/v1/ratings", ratingRouter);
app.use("/api/v1/reports", reportRouter);
app.use("/api/v1/posts", postRouter);
app.use("/api/v1/messages", messageRouter);
app.use("/api/v1/push", pushRouter);
app.use("/api/v1/calls", callRouter);
app.use("/admin", adminRouter);

app.use((req, res) => {
  sendError(res, 404, "Route not found", "NOT_FOUND");
});

app.use((error, req, res, next) => {
  logError("unhandled", error, { path: req.path });
  if (res.headersSent) return next(error);
  if (error?.code === "LIMIT_FILE_SIZE") {
    return sendError(
      res,
      400,
      "That image is too large. Please use a file under 5 MB.",
      "VALIDATION_ERROR",
    );
  }
  const status = error.statusCode || error.status || 500;
  const codes = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    429: "RATE_LIMITED",
  };
  sendError(
    res,
    status,
    status >= 500
      ? "Something went wrong. Please try again."
      : error.message || "Something went wrong.",
    error.errorCode || codes[status] || "INTERNAL_ERROR",
  );
});

export default app;

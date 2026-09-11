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
import { createRateLimiter } from "./middleware/rate-limit.middleware.js";
import { isAllowedOrigin } from "./config/cors.config.js";

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
app.use(morgan("dev"));
app.use(
  cors({
    origin: (origin, callback) => {
      return callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  }),
);
app.use(createRateLimiter({ windowMs: 60_000, max: 180 }));

// db config
connectionDb().catch(() => {
  // The API stays online so health checks and a later retry can report the outage.
});

// health route
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server Health Is 100%",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "unavailable",
  });
});

// routes
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
app.use("/admin", adminRouter);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use((error, req, res, next) => {
  console.error("Unhandled backend error:", error);
  if (res.headersSent) return next(error);
  const status = error.statusCode || error.status || 500;
  res.status(status).json({
    success: false,
    message:
      status >= 500 ? "Something went wrong. Please try again." : error.message,
  });
});

export default app;

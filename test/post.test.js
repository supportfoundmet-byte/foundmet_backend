import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import PostModel from "../src/models/post.model.js";
import CommentModel from "../src/models/comment.model.js";
import { optionalAuth } from "../src/middleware/auth.middleware.js";
import { deleteMessage, clearConversation } from "../src/controllers/message.controller.js";

function responseMock() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("optionalAuth allows unauthenticated requests with req.user = null", () => {
  const req = { headers: {}, cookies: {}, path: "/api/v1/posts" };
  const res = responseMock();
  let nextCalled = false;

  optionalAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user, null);
});

test("PostModel schema validates allowed categories", () => {
  const allowedCategories = ["general", "seeking_cofounder", "milestone", "idea", "tech"];
  const enumValues = PostModel.schema.path("category").enumValues;

  for (const cat of allowedCategories) {
    assert.ok(enumValues.includes(cat), `Category '${cat}' should be in Post schema enum`);
  }
});

test("CommentModel schema validates required fields", () => {
  const paths = CommentModel.schema.paths;
  assert.ok(paths.post, "Comment must have 'post' path");
  assert.ok(paths.author, "Comment must have 'author' path");
  assert.ok(paths.text, "Comment must have 'text' path");
});

test("deleteMessage rejects invalid message ID", async () => {
  const req = {
    user: { _id: new mongoose.Types.ObjectId() },
    params: { messageId: "invalid-id" },
    app: { get: () => null },
  };
  const res = responseMock();

  await deleteMessage(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});

test("clearConversation rejects invalid user ID", async () => {
  const req = {
    user: { _id: new mongoose.Types.ObjectId() },
    params: { otherUserId: "invalid-user-id" },
    app: { get: () => null },
  };
  const res = responseMock();

  await clearConversation(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin } from "../src/config/cors.config.js";
import { verifyAuth } from "../src/middleware/auth.middleware.js";
import { verifySuperAdmin } from "../src/middleware/admin.middleware.js";
import { httpError, sendError, sendSuccess } from "../src/utils/http.js";
import { isStrongPassword, sanitizeText } from "../src/utils/sanitize.js";

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

test("allows configured frontend origins and local development origins", () => {
  const previous = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = "https://app.example.com, https://admin.example.com/";

  assert.equal(isAllowedOrigin("https://app.example.com"), true);
  assert.equal(isAllowedOrigin("https://admin.example.com"), true);
  assert.equal(isAllowedOrigin("http://localhost:5173"), true);
  assert.equal(isAllowedOrigin("https://malicious.example.com"), false);

  if (previous === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = previous;
});

test("rejects unauthenticated user requests when no access token is provided", () => {
  const previousSecret = process.env.ACCESS_TOKEN_SECRET;
  process.env.ACCESS_TOKEN_SECRET = "test-secret";
  const req = { headers: {}, cookies: {}, path: "/auth/me" };
  const res = responseMock();
  let nextCalled = false;

  verifyAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.errorCode, "UNAUTHENTICATED");

  if (previousSecret === undefined) delete process.env.ACCESS_TOKEN_SECRET;
  else process.env.ACCESS_TOKEN_SECRET = previousSecret;
});

test("rejects invalid bearer tokens without querying the database", () => {
  const previousSecret = process.env.ACCESS_TOKEN_SECRET;
  process.env.ACCESS_TOKEN_SECRET = "test-secret";
  const req = {
    headers: { authorization: "Bearer invalid-token" },
    cookies: {},
    path: "/auth/me",
  };
  const res = responseMock();

  verifyAuth(req, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.errorCode, "INVALID_SESSION");

  if (previousSecret === undefined) delete process.env.ACCESS_TOKEN_SECRET;
  else process.env.ACCESS_TOKEN_SECRET = previousSecret;
});

test("rejects invalid admin bearer tokens without querying the database", () => {
  const previousSecret = process.env.ACCESS_TOKEN_SECRET;
  process.env.ACCESS_TOKEN_SECRET = "test-secret";
  const req = { headers: { authorization: "Bearer invalid-token" }, cookies: {} };
  const res = responseMock();

  verifySuperAdmin(req, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.errorCode, "INVALID_SESSION");

  if (previousSecret === undefined) delete process.env.ACCESS_TOKEN_SECRET;
  else process.env.ACCESS_TOKEN_SECRET = previousSecret;
});

test("returns consistent success and error response shapes", () => {
  const successResponse = responseMock();
  sendSuccess(successResponse, "Done", { id: 1 });
  assert.equal(successResponse.statusCode, 200);
  assert.deepEqual(successResponse.body, {
    success: true,
    message: "Done",
    data: { id: 1 },
  });

  const errorResponse = responseMock();
  sendError(errorResponse, 403, "Forbidden", "FORBIDDEN");
  assert.equal(errorResponse.statusCode, 403);
  assert.deepEqual(errorResponse.body, {
    success: false,
    message: "Forbidden",
    errorCode: "FORBIDDEN",
  });
});

test("sanitizes text and validates strong passwords", () => {
  assert.equal(sanitizeText(" <script>alert(1)</script> "), "scriptalert(1)/script");
  assert.equal(isStrongPassword("password1"), true);
  assert.equal(isStrongPassword("password"), false);
  assert.equal(isStrongPassword("short1"), false);
});

test("creates typed HTTP errors", () => {
  const error = httpError(409, "Already exists", "DUPLICATE");
  assert.equal(error.statusCode, 409);
  assert.equal(error.errorCode, "DUPLICATE");
  assert.equal(error.message, "Already exists");
});

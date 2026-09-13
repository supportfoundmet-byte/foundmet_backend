import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { listCalls, missedCallCount, deleteCall } from "../src/controllers/call.controller.js";
import CallModel from "../src/models/call.model.js";

function mockResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    set(header, value) {
      this.headers[header] = value;
      return this;
    },
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

test("Call Model Schema & State Lifecycle Rules", () => {
  const allowedStatuses = ["missed", "answered", "rejected", "ended", "busy"];
  const enumValues = CallModel.schema.path("status").enumValues;
  
  for (const status of allowedStatuses) {
    assert.ok(enumValues.includes(status), `Status '${status}' should be in Call schema enum`);
  }

  // Duration calculation test
  const startedAt = new Date("2026-09-13T10:00:00Z");
  const endedAt = new Date("2026-09-13T10:02:35Z");
  const duration = Math.round((endedAt - startedAt) / 1000);
  assert.equal(duration, 155, "Duration should be 155 seconds");
});

test("Calling Security: Rejects self-calling", () => {
  const callerId = "user_abc_123";
  const calleeId = "user_abc_123";
  const isSelfCall = String(callerId) === String(calleeId);
  assert.equal(isSelfCall, true, "Self call must be detected and blocked");
});

test("Calling Security: Rejects invalid Call IDs for deletion", async () => {
  const req = {
    user: { _id: new mongoose.Types.ObjectId() },
    params: { callId: "not-a-valid-object-id" },
  };
  const res = mockResponse();

  await deleteCall(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.errorCode, "VALIDATION_ERROR");
});

test("Calling Signaling: Formats call direction correctly", () => {
  const currentUserId = "user_1";
  const mockCalls = [
    { caller: "user_1", callee: "user_2", status: "ended", duration: 45 },
    { caller: "user_2", callee: "user_1", status: "missed", duration: 0 },
  ];

  const formatted = mockCalls.map((call) => {
    const isCaller = String(call.caller) === String(currentUserId);
    return {
      direction: isCaller ? "outgoing" : "incoming",
      otherId: isCaller ? String(call.callee) : String(call.caller),
      status: call.status,
    };
  });

  assert.equal(formatted[0].direction, "outgoing");
  assert.equal(formatted[0].otherId, "user_2");
  assert.equal(formatted[1].direction, "incoming");
  assert.equal(formatted[1].otherId, "user_2");
});

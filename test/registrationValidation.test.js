import test from "node:test";
import assert from "node:assert/strict";
import { validateCreateUserInput } from "../src/utils/registrationValidation.js";

test("rejects an invalid registration payload", () => {
  const result = validateCreateUserInput({
    email: "invalid-email",
    name: "A",
    password: "pass",
    hasProject: "no",
    projectDetails: "",
    imageProvided: false,
  });

  assert.equal(result.valid, false);
  assert.match(result.message, /valid email|profile photo|password/i);
});

test("requires a profile image", () => {
  const result = validateCreateUserInput({
    email: "user@example.com",
    name: "Ava Stone",
    password: "StrongPass1!",
    hasProject: "no",
    projectDetails: "",
    imageProvided: false,
  });

  assert.equal(result.valid, false);
  assert.match(result.message, /profile photo/i);
});

test("requires project details when the founder says they have a project", () => {
  const result = validateCreateUserInput({
    email: "founder@example.com",
    name: "Ava Stone",
    password: "StrongPass1!",
    hasProject: "yes",
    projectDetails: "   ",
    imageProvided: true,
  });

  assert.equal(result.valid, false);
  assert.match(result.message, /briefly describe/i);
});

test("accepts a valid registration payload", () => {
  const result = validateCreateUserInput({
    email: "founder@example.com",
    name: "Ava Stone",
    password: "StrongPass1!",
    hasProject: "yes",
    projectDetails: "Building an AI sourcing platform.",
    imageProvided: true,
  });

  assert.equal(result.valid, true);
  assert.equal(result.normalizedEmail, "founder@example.com");
  assert.equal(result.normalizedName, "Ava Stone");
});

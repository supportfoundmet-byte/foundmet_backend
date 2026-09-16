import { isStrongPassword } from "./sanitize.js";

export function validateCreateUserInput({
  email,
  name,
  password,
  hasProject,
  projectDetails,
  imageProvided,
}) {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const normalizedName = typeof name === "string" ? name.trim() : "";

  const issues = [];

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
    issues.push("Use a valid email and a password with at least 8 characters, including a letter and a number.");
  }

  if (!normalizedName || normalizedName.length < 2 || normalizedName.length > 100) {
    issues.push("Use a valid email and a password with at least 8 characters, including a letter and a number.");
  }

  if (!password || !isStrongPassword(password)) {
    issues.push("Use a valid email and a password with at least 8 characters, including a letter and a number.");
  }

  if (!imageProvided) {
    issues.push("Profile photo is required.");
  }

  if (hasProject === "yes" && !String(projectDetails || "").trim()) {
    issues.push("Please briefly describe what you are building.");
  }

  return {
    valid: issues.length === 0,
    message:
      issues[0] || "Validation failed.",
    issues,
    normalizedEmail,
    normalizedName,
  };
}

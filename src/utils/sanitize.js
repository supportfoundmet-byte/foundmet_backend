export function sanitizeText(value, maxLength = 2000) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[<>]/g, "")
    .replace(/https?:\/\/javascript:/gi, "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

export function isStrongPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  );
}

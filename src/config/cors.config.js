const normalizeOrigin = (origin) => origin.trim().replace(/\/+$/, "");

export const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  const configuredOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(",")
    : [];
  const allowedOrigins = [
    "http://localhost:5173",
    "https://foundmet.supportfoundmet.workers.dev",
    ...configuredOrigins,
  ]
    .map(normalizeOrigin)
    .filter(Boolean);
  if (allowedOrigins.includes(normalizedOrigin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(normalizedOrigin);
};

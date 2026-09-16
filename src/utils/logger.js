import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SENSITIVE =
  /password|token|secret|authorization|cookie|mongo|credential|apikey|private/i;

function scrub(value, seen = new WeakSet()) {
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE.test(key) ? "[redacted]" : scrub(item, seen),
      ]),
    );
  }
  return value;
}

const loggerDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../logs",
);
const loggerFile =
  process.env.LOG_FILE || path.join(loggerDirectory, "application.log");

function writeLog(level, event, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    details: scrub(details),
  };

  try {
    fs.mkdirSync(path.dirname(loggerFile), { recursive: true });
    fs.appendFileSync(loggerFile, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error("[FoundMet] logger_write_failed", {
      message: error.message,
      file: loggerFile,
    });
  }

  return entry;
}

export function logInfo(event, details = {}) {
  const entry = writeLog("info", event, details);
  console.info(`[FoundMet] ${event}`, entry.details);
}

export function logWarn(event, details = {}) {
  const entry = writeLog("warn", event, details);
  console.warn(`[FoundMet] ${event}`, entry.details);
}

export function logError(event, error, details = {}) {
  const errorDetails = {
    ...scrub(details),
    message: error?.message,
    code: error?.code,
  };
  const entry = writeLog("error", event, errorDetails);
  console.error(`[FoundMet] ${event}`, entry.details);
}

export function getLogFilePath() {
  return loggerFile;
}

export function createLogStream() {
  return {
    write(message) {
      const line = String(message).trim();
      if (line) writeLog("http", "request", { message: line });
    },
  };
}

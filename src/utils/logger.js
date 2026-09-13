const SENSITIVE =
  /password|token|secret|authorization|cookie|mongo|credential|apikey|private/i;

function scrub(value) {
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE.test(key) ? "[redacted]" : scrub(item),
      ]),
    );
  }
  return value;
}

export function logInfo(event, details = {}) {
  console.info(`[FoundMet] ${event}`, scrub(details));
}

export function logWarn(event, details = {}) {
  console.warn(`[FoundMet] ${event}`, scrub(details));
}

export function logError(event, error, details = {}) {
  console.error(`[FoundMet] ${event}`, {
    ...scrub(details),
    message: error?.message,
    code: error?.code,
  });
}

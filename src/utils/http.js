export function sendSuccess(res, message, data = {}, status = 200) {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
}

export function sendError(res, status, message, errorCode = "ERROR") {
  return res.status(status).json({
    success: false,
    message,
    errorCode,
  });
}

export function httpError(status, message, errorCode = "ERROR") {
  const error = new Error(message);
  error.statusCode = status;
  error.errorCode = errorCode;
  return error;
}

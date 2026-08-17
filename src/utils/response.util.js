function sendSuccess(res, data = null, statusCode = 200, meta = {}) {
  const requestId = res.locals.requestId || meta.requestId || null;
  return res.status(statusCode).json({
    success: true,
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      ...meta
    }
  });
}

function sendError(res, errorCode, message, statusCode = 400, details = null, meta = {}) {
  const requestId = res.locals.requestId || meta.requestId || null;
  return res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      details
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      ...meta
    }
  });
}

module.exports = {
  sendSuccess,
  sendError
};

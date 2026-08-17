const AppError = require('../utils/app-error.util');
const { sendError } = require('../utils/response.util');
const { ERROR_CODES } = require('../constants/error-codes');

function errorHandler(err, req, res, next) {
  // If headers already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // 1. Operational, trusted errors (AppError)
  if (err instanceof AppError) {
    return sendError(
      res,
      err.errorCode || ERROR_CODES.BAD_REQUEST,
      err.message,
      err.statusCode || 400,
      err.details
    );
  }

  // 2. Prisma Database Specific Errors
  if (err.code === 'P2002') {
    const fields = err.meta?.target ? ` (${err.meta.target})` : '';
    return sendError(
      res,
      ERROR_CODES.CONFLICT,
      `يوجد سجل مطابق مسبقاً بهذا الحقل الفريد${fields}`,
      409,
      err.meta
    );
  }

  if (err.code === 'P2025') {
    return sendError(
      res,
      ERROR_CODES.NOT_FOUND,
      'السجل المطلوب غير موجود أو تم حذفه',
      404
    );
  }

  // 3. Unhandled Internal Server Errors
  console.error('🔥 [Unhandled Error]:', err);
  const isProd = process.env.NODE_ENV === 'production';

  return sendError(
    res,
    ERROR_CODES.INTERNAL_SERVER_ERROR,
    'حدث خطأ غير متوقع في الخادم، يرجى المحاولة لاحقاً',
    500,
    isProd ? null : { message: err.message, stack: err.stack }
  );
}

module.exports = errorHandler;

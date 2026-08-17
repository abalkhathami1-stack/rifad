const multer = require('multer');
const AppError = require('../utils/app-error.util');
const { ERROR_CODES } = require('../constants/error-codes');

// Memory storage to process files directly in RAM without saving unencrypted data to disk
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.xlsx', '.xls', '.csv'];
  const fileName = (file.originalname || '').toLowerCase();
  const isValidExt = allowedExtensions.some(ext => fileName.endsWith(ext));

  if (!isValidExt) {
    return cb(new AppError('امتداد الملف غير مدعوم. يرجى رفع ملف بصيغة XLSX أو CSV فقط', 400, ERROR_CODES.VALIDATION_ERROR), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB limit
  }
});

module.exports = upload;

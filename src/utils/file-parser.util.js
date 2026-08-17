const xlsx = require('xlsx');
const AppError = require('./app-error.util');
const { ERROR_CODES } = require('../constants/error-codes');
const ImportValidatorUtil = require('./import-validator.util');

class FileParserUtil {
  /**
   * Parses an Excel or CSV file buffer into an array of normalized JSON rows.
   */
  static parseBuffer(buffer, originalFileName, entityType) {
    if (!buffer || buffer.length === 0) {
      throw new AppError('الملف المرفوع فارغ (0 بايت)', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const ext = (originalFileName || '').split('.').pop().toLowerCase();
    const validExtensions = ['xlsx', 'xls', 'csv'];

    if (!validExtensions.includes(ext)) {
      throw new AppError(`صيغة الملف غير مدعومة (.${ext}). يرجى رفع ملف بصيغة XLSX أو CSV فقط`, 400, ERROR_CODES.VALIDATION_ERROR);
    }

    let workbook;
    try {
      workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true, cellText: false });
    } catch (err) {
      throw new AppError(`فشل في قراءة ومعالجة الملف: ${err.message}`, 400, ERROR_CODES.VALIDATION_ERROR);
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new AppError('الملف لا يحتوي على أي صفحات عمل صالحة (Sheets)', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];

    // Read rows as JSON with raw values
    const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: null, blankrows: false });

    if (rawRows.length === 0) {
      throw new AppError('ورقة العمل لا تحتوي على أي صفوف بيانات بعد صف العناوين', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    // Normalize each row's column names
    const normalizedRows = rawRows.map((row, index) => {
      const normalized = ImportValidatorUtil.normalizeHeaders(row);
      return {
        rowNumber: index + 1,
        rawData: normalized
      };
    });

    // Validate that required template headers exist
    const sampleRows = normalizedRows.map(r => r.rawData);
    ImportValidatorUtil.validateTemplateHeaders(entityType, sampleRows);

    return normalizedRows;
  }
}

module.exports = FileParserUtil;

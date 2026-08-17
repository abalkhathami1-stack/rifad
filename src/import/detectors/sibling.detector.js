/**
 * Sibling & Guardian Detector
 * Analyzes normalized records to cluster siblings by Parent ID, detects family groups,
 * and identifies discrepancies for the Review Queue without writing to operational tables.
 */
class SiblingDetector {
  /**
   * Analyzes an array of normalized student+parent records and groups them by Parent ID.
   * @param {Array<Object>} records - array of { rowNumber, recordId, data: normalizedRowObj, isValid }
   * @returns {Object} { siblingGroups, reviewQueue, singletonsCount, multiChildFamiliesCount }
   */
  static analyze(records) {
    const parentMap = new Map();

    // Group valid records by normalized Parent ID
    for (const rec of records) {
      if (!rec.isValid) continue; // skip structurally invalid records from clustering

      const parentId = rec.data.parent.normalized.id;
      if (!parentId) continue;

      if (!parentMap.has(parentId)) {
        parentMap.set(parentId, []);
      }
      parentMap.get(parentId).push(rec);
    }

    const siblingGroups = [];
    const reviewQueue = [];
    let singletonsCount = 0;
    let multiChildFamiliesCount = 0;

    for (const [parentId, memberRecords] of parentMap.entries()) {
      if (memberRecords.length === 1) {
        singletonsCount++;
        const soleMember = memberRecords[0];
        siblingGroups.push({
          parentId,
          status: 'SINGLE_CHILD',
          parentName: soleMember.data.parent.raw.name,
          parentPhone: soleMember.data.parent.normalized.phone,
          parentEmail: soleMember.data.parent.normalized.email,
          children: [
            {
              rowNumber: soleMember.rowNumber,
              recordId: soleMember.recordId,
              studentName: soleMember.data.student.raw.name,
              grade: soleMember.data.student.raw.grade,
              section: soleMember.data.student.raw.section
            }
          ]
        });
        continue;
      }

      // Multiple students sharing the same Parent ID -> Family Group
      multiChildFamiliesCount++;

      // Check consistency of parent name and phone across siblings
      const parentNamesSet = new Set();
      const parentSignaturesSet = new Set();
      const parentPhonesSet = new Set();

      const children = memberRecords.map(m => {
        parentNamesSet.add(m.data.parent.normalized.name);
        parentSignaturesSet.add(m.data.parent.normalized.signature);
        parentPhonesSet.add(m.data.parent.normalized.phone);

        return {
          rowNumber: m.rowNumber,
          recordId: m.recordId,
          studentName: m.data.student.raw.name,
          grade: m.data.student.raw.grade,
          section: m.data.student.raw.section,
          parentNameInRow: m.data.parent.raw.name,
          parentPhoneInRow: m.data.parent.raw.phone
        };
      });

      // Name matches if all normalized names or all comparison signatures match
      const isNameConsistent = parentNamesSet.size === 1 || parentSignaturesSet.size === 1;
      const isPhoneConsistent = parentPhonesSet.size === 1;

      if (isNameConsistent && isPhoneConsistent) {
        // High-confidence automatic match
        siblingGroups.push({
          parentId,
          status: 'AUTO_MATCHED',
          parentName: memberRecords[0].data.parent.raw.name,
          parentNameNormalized: memberRecords[0].data.parent.normalized.name,
          parentPhone: memberRecords[0].data.parent.normalized.phone,
          parentEmail: memberRecords[0].data.parent.normalized.email,
          childrenCount: children.length,
          children
        });
      } else {
        // Discrepancy detected -> Flag for Human Review
        let issueType = 'MULTIPLE_DISCREPANCIES';
        let reasonAr = 'يوجد تباين في بيانات ولي الأمر المسجلة بين الإخوة';

        if (!isNameConsistent && isPhoneConsistent) {
          issueType = 'PARENT_NAME_MISMATCH';
          reasonAr = `اختلاف في اسم ولي الأمر المسجل بين الإخوة المسجلين برقم الهوية نفسه (${Array.from(parentNamesSet).join(' / ')})`;
        } else if (isNameConsistent && !isPhoneConsistent) {
          issueType = 'PARENT_PHONE_MISMATCH';
          reasonAr = `اختلاف في رقم جوال ولي الأمر المسجل بين الإخوة (${Array.from(parentPhonesSet).join(' / ')})`;
        }

        const reviewItem = {
          parentId,
          issueType,
          reasonAr,
          rowNumbers: children.map(c => c.rowNumber),
          conflictingChildren: children
        };

        reviewQueue.push(reviewItem);

        siblingGroups.push({
          parentId,
          status: 'NEEDS_REVIEW',
          issueType,
          reasonAr,
          childrenCount: children.length,
          children
        });
      }
    }

    return {
      siblingGroups,
      reviewQueue,
      uniqueParentsCount: parentMap.size,
      singletonsCount,
      multiChildFamiliesCount,
      needsReviewCount: reviewQueue.length
    };
  }
}

module.exports = SiblingDetector;

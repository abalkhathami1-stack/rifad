import React from 'react';

/**
 * Visual workflow stepper for Promotion & Rollover domain
 * 
 * Steps:
 * 1: تهيئة الدفعة (Initialize Batch)
 * 2: توليد القرارات (Generate Decisions)
 * 3: المراجعة والتدقيق (Review & Override)
 * 4: الاعتماد والترحيل (Approve & Rollover)
 */
export function PromotionStepper({ currentStep = 1 }) {
  const steps = [
    { num: 1, title: 'تهيئة الدفعة' },
    { num: 2, title: 'توليد القرارات' },
    { num: 3, title: 'المراجعة والتدقيق' },
    { num: 4, title: 'الاعتماد والترحيل' }
  ];

  return (
    <div className="promotion-stepper" aria-label="مراحل الترفيع الأكاديمي">
      {steps.map((s) => {
        const isActive = currentStep === s.num;
        const isCompleted = currentStep > s.num;
        let stepClass = 'stepper-step';
        if (isActive) stepClass += ' active';
        if (isCompleted) stepClass += ' completed';

        return (
          <div key={s.num} className={stepClass}>
            <div className="step-number">
              {isCompleted ? '✓' : s.num}
            </div>
            <span className="step-title">{s.title}</span>
          </div>
        );
      })}
    </div>
  );
}

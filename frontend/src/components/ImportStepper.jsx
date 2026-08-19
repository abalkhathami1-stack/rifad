import React from 'react';

/**
 * Visual workflow stepper for Import Engine
 * Steps:
 * 1: رفع الملف (Upload)
 * 2: فحص وتحقق البيانات (Validation)
 * 3: الاعتماد والترحيل (Commit)
 */
export function ImportStepper({ currentStep = 1 }) {
  const steps = [
    { num: 1, title: 'رفع الملف' },
    { num: 2, title: 'فحص وتحقق البيانات' },
    { num: 3, title: 'الاعتماد والترحيل' }
  ];

  return (
    <div className="import-stepper" aria-label="مراحل الاستيراد">
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

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'GRADUATED', 'TRANSFERRED_OUT');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PROMOTED', 'RETAINED', 'TRANSFERRED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_code" VARCHAR(50) NOT NULL,
    "first_name_ar" VARCHAR(100) NOT NULL,
    "second_name_ar" VARCHAR(100),
    "third_name_ar" VARCHAR(100),
    "family_name_ar" VARCHAR(100) NOT NULL,
    "full_name_ar" VARCHAR(400) NOT NULL,
    "full_name_en" VARCHAR(400),
    "national_id" VARCHAR(50),
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_enrollments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "academic_term_id" UUID,
    "class_section_id" UUID NOT NULL,
    "enrollment_status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrollment_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "students_school_id_student_code_idx" ON "students"("school_id", "student_code");

-- CreateIndex
CREATE INDEX "students_school_id_full_name_ar_idx" ON "students"("school_id", "full_name_ar");

-- CreateIndex
CREATE INDEX "students_deleted_at_idx" ON "students"("deleted_at");

-- CreateIndex
CREATE INDEX "student_enrollments_school_id_student_id_academic_year_id_idx" ON "student_enrollments"("school_id", "student_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "student_enrollments_school_id_class_section_id_idx" ON "student_enrollments"("school_id", "class_section_id");

-- CreateIndex
CREATE INDEX "student_enrollments_deleted_at_idx" ON "student_enrollments"("deleted_at");

-- Partial Unique Indexes for Soft Delete
CREATE UNIQUE INDEX "uq_students_school_code_active" ON "students"("school_id", "student_code") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "uq_student_enrollments_student_year_active" ON "student_enrollments"("student_id", "academic_year_id") WHERE "deleted_at" IS NULL;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academic_term_id_fkey" FOREIGN KEY ("academic_term_id") REFERENCES "academic_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

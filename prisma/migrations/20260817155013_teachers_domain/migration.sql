-- CreateEnum
CREATE TYPE "TeacherStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED');

-- CreateTable
CREATE TABLE "specializations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name_ar" VARCHAR(150) NOT NULL,
    "name_en" VARCHAR(150),
    "code" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "specializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "specialization_id" UUID NOT NULL,
    "employee_number" VARCHAR(50) NOT NULL,
    "first_name_ar" VARCHAR(100) NOT NULL,
    "family_name_ar" VARCHAR(100) NOT NULL,
    "full_name_ar" VARCHAR(400) NOT NULL,
    "full_name_en" VARCHAR(400),
    "nationality" VARCHAR(100) NOT NULL,
    "professional_license_number" VARCHAR(100),
    "hire_date" DATE NOT NULL,
    "status" "TeacherStatus" NOT NULL DEFAULT 'ACTIVE',
    "national_id_encrypted" TEXT NOT NULL,
    "phone_encrypted" TEXT,
    "email_encrypted" TEXT,
    "national_id_hash" VARCHAR(64) NOT NULL,
    "phone_hash" VARCHAR(64),
    "email_hash" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_subjects" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_assignments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "academic_term_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "specializations_school_id_name_ar_idx" ON "specializations"("school_id", "name_ar");

-- CreateIndex
CREATE INDEX "specializations_deleted_at_idx" ON "specializations"("deleted_at");

-- CreateIndex
CREATE INDEX "teachers_school_id_employee_number_idx" ON "teachers"("school_id", "employee_number");

-- CreateIndex
CREATE INDEX "teachers_school_id_national_id_hash_idx" ON "teachers"("school_id", "national_id_hash");

-- CreateIndex
CREATE INDEX "teachers_school_id_phone_hash_idx" ON "teachers"("school_id", "phone_hash");

-- CreateIndex
CREATE INDEX "teachers_school_id_email_hash_idx" ON "teachers"("school_id", "email_hash");

-- CreateIndex
CREATE INDEX "teachers_deleted_at_idx" ON "teachers"("deleted_at");

-- CreateIndex
CREATE INDEX "teacher_subjects_school_id_teacher_id_idx" ON "teacher_subjects"("school_id", "teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_subjects_teacher_id_subject_id_key" ON "teacher_subjects"("teacher_id", "subject_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_school_id_teacher_id_academic_year_id_idx" ON "teacher_assignments"("school_id", "teacher_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_school_id_class_section_id_idx" ON "teacher_assignments"("school_id", "class_section_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_deleted_at_idx" ON "teacher_assignments"("deleted_at");

-- Partial Unique Indexes for Soft Delete
CREATE UNIQUE INDEX "uq_specializations_school_name_active" ON "specializations"("school_id", "name_ar") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "uq_teachers_school_emp_active" ON "teachers"("school_id", "employee_number") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "uq_teacher_assignments_active" ON "teacher_assignments"("teacher_id", "subject_id", "class_section_id", "academic_year_id", "academic_term_id") WHERE "deleted_at" IS NULL;

-- AddForeignKey
ALTER TABLE "specializations" ADD CONSTRAINT "specializations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_specialization_id_fkey" FOREIGN KEY ("specialization_id") REFERENCES "specializations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_academic_term_id_fkey" FOREIGN KEY ("academic_term_id") REFERENCES "academic_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

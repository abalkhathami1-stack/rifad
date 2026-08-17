-- CreateEnum
CREATE TYPE "SchoolSectionGender" AS ENUM ('BOYS', 'GIRLS', 'MIXED');

-- CreateTable
CREATE TABLE "school_sections" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "gender_type" "SchoolSectionGender" NOT NULL,
    "name_ar" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "school_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_terms" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name_ar" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100),
    "term_order" SMALLINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "academic_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educational_stages" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name_ar" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100),
    "stage_order" SMALLINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "educational_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "name_ar" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100),
    "grade_level" SMALLINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_sections" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "section_division_id" UUID NOT NULL,
    "name_ar" VARCHAR(50) NOT NULL,
    "name_en" VARCHAR(50),
    "max_capacity" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "class_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name_ar" VARCHAR(150) NOT NULL,
    "name_en" VARCHAR(150),
    "code" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_sections_school_id_gender_type_idx" ON "school_sections"("school_id", "gender_type");

-- CreateIndex
CREATE INDEX "school_sections_deleted_at_idx" ON "school_sections"("deleted_at");

-- CreateIndex
CREATE INDEX "academic_years_school_id_is_current_idx" ON "academic_years"("school_id", "is_current");

-- CreateIndex
CREATE INDEX "academic_years_deleted_at_idx" ON "academic_years"("deleted_at");

-- CreateIndex
CREATE INDEX "academic_terms_academic_year_id_term_order_idx" ON "academic_terms"("academic_year_id", "term_order");

-- CreateIndex
CREATE INDEX "academic_terms_deleted_at_idx" ON "academic_terms"("deleted_at");

-- CreateIndex
CREATE INDEX "educational_stages_school_id_stage_order_idx" ON "educational_stages"("school_id", "stage_order");

-- CreateIndex
CREATE INDEX "educational_stages_deleted_at_idx" ON "educational_stages"("deleted_at");

-- CreateIndex
CREATE INDEX "grades_school_id_stage_id_idx" ON "grades"("school_id", "stage_id");

-- CreateIndex
CREATE INDEX "grades_deleted_at_idx" ON "grades"("deleted_at");

-- CreateIndex
CREATE INDEX "class_sections_school_id_academic_year_id_grade_id_idx" ON "class_sections"("school_id", "academic_year_id", "grade_id");

-- CreateIndex
CREATE INDEX "class_sections_deleted_at_idx" ON "class_sections"("deleted_at");

-- CreateIndex
CREATE INDEX "subjects_school_id_code_idx" ON "subjects"("school_id", "code");

-- CreateIndex
CREATE INDEX "subjects_deleted_at_idx" ON "subjects"("deleted_at");

-- Partial Unique Indexes for Soft Delete
CREATE UNIQUE INDEX "uq_subjects_school_code_active" ON "subjects"("school_id", "code") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "uq_academic_years_school_name_active" ON "academic_years"("school_id", "name") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "uq_academic_terms_year_order_active" ON "academic_terms"("academic_year_id", "term_order") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "uq_educational_stages_school_order_active" ON "educational_stages"("school_id", "stage_order") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "uq_grades_stage_level_active" ON "grades"("stage_id", "grade_level") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "uq_class_sections_unique_active" ON "class_sections"("academic_year_id", "grade_id", "section_division_id", "name_ar") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "uq_school_sections_school_name_active" ON "school_sections"("school_id", "name_ar") WHERE "deleted_at" IS NULL;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_section_division_id_fkey" FOREIGN KEY ("section_division_id") REFERENCES "school_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_sections" ADD CONSTRAINT "school_sections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educational_stages" ADD CONSTRAINT "educational_stages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "educational_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_section_division_id_fkey" FOREIGN KEY ("section_division_id") REFERENCES "school_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

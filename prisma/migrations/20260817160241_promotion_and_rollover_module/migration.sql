-- CreateEnum
CREATE TYPE "PromotionBatchStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PromotionAction" AS ENUM ('PROMOTE', 'RETAIN', 'GRADUATE', 'LEAVE');

-- CreateTable
CREATE TABLE "promotion_batches" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "source_academic_year_id" UUID NOT NULL,
    "target_academic_year_id" UUID NOT NULL,
    "status" "PromotionBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "total_students" INTEGER NOT NULL DEFAULT 0,
    "promoted_count" INTEGER NOT NULL DEFAULT 0,
    "retained_count" INTEGER NOT NULL DEFAULT 0,
    "graduated_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_batch_items" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "from_class_section_id" UUID NOT NULL,
    "suggested_action" "PromotionAction" NOT NULL,
    "final_action" "PromotionAction" NOT NULL,
    "to_class_section_id" UUID,
    "override_reason" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_batch_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotion_batches_school_id_status_idx" ON "promotion_batches"("school_id", "status");

-- CreateIndex
CREATE INDEX "promotion_batch_items_batch_id_student_id_idx" ON "promotion_batch_items"("batch_id", "student_id");

-- AddForeignKey
ALTER TABLE "promotion_batches" ADD CONSTRAINT "promotion_batches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batches" ADD CONSTRAINT "promotion_batches_source_academic_year_id_fkey" FOREIGN KEY ("source_academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batches" ADD CONSTRAINT "promotion_batches_target_academic_year_id_fkey" FOREIGN KEY ("target_academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batches" ADD CONSTRAINT "promotion_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batches" ADD CONSTRAINT "promotion_batches_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batch_items" ADD CONSTRAINT "promotion_batch_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "promotion_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batch_items" ADD CONSTRAINT "promotion_batch_items_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batch_items" ADD CONSTRAINT "promotion_batch_items_from_class_section_id_fkey" FOREIGN KEY ("from_class_section_id") REFERENCES "class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_batch_items" ADD CONSTRAINT "promotion_batch_items_to_class_section_id_fkey" FOREIGN KEY ("to_class_section_id") REFERENCES "class_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

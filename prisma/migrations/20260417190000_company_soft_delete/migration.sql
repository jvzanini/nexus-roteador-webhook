ALTER TABLE "companies" ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE INDEX "idx_company_deleted_at" ON "companies"("deleted_at");

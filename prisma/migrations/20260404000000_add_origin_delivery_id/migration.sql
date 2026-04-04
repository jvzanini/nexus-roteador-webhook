-- AlterTable
ALTER TABLE "route_deliveries" ADD COLUMN "origin_delivery_id" UUID;

-- AddForeignKey
ALTER TABLE "route_deliveries" ADD CONSTRAINT "route_deliveries_origin_delivery_id_fkey" FOREIGN KEY ("origin_delivery_id") REFERENCES "route_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

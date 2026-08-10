-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "brand" TEXT;

-- CreateIndex
CREATE INDEX "Product_brand_idx" ON "Product"("brand");

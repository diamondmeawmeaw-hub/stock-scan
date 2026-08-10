-- AlterTable
ALTER TABLE "ScanLog" ADD COLUMN     "vendorId" TEXT;

-- AlterTable
ALTER TABLE "SerialUnit" ADD COLUMN     "vendorId" TEXT;

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_code_key" ON "Vendor"("code");

-- CreateIndex
CREATE INDEX "ScanLog_vendorId_idx" ON "ScanLog"("vendorId");

-- CreateIndex
CREATE INDEX "SerialUnit_vendorId_idx" ON "SerialUnit"("vendorId");

-- AddForeignKey
ALTER TABLE "SerialUnit" ADD CONSTRAINT "SerialUnit_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

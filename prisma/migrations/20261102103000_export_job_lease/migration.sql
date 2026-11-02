-- AlterTable
ALTER TABLE "ExportJob" ADD COLUMN "leaseId" TEXT,
ADD COLUMN "heartbeatAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ExportJob_status_heartbeatAt_idx" ON "ExportJob"("status", "heartbeatAt");

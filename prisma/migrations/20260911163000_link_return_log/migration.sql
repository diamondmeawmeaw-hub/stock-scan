-- Link a return (IN) log to the OUT log it reverses (one return per OUT log)
ALTER TABLE "ScanLog" ADD COLUMN "reversesId" TEXT;

CREATE UNIQUE INDEX "ScanLog_reversesId_key" ON "ScanLog"("reversesId");

ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "ScanLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

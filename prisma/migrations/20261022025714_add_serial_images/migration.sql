-- CreateTable
CREATE TABLE "SerialImage" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'รูปตัวอุปกรณ์',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SerialImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SerialImage_unitId_createdAt_idx" ON "SerialImage"("unitId", "createdAt");

-- AddForeignKey
ALTER TABLE "SerialImage" ADD CONSTRAINT "SerialImage_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SerialUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialImage" ADD CONSTRAINT "SerialImage_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

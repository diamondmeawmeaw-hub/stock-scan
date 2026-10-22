-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "fileName" TEXT,
    "contentType" TEXT,
    "size" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExportJob_status_createdAt_idx" ON "ExportJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ExportJob_userId_createdAt_idx" ON "ExportJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExportJob_expiresAt_idx" ON "ExportJob"("expiresAt");

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

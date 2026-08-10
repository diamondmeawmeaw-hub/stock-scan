-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('IN_STOCK', 'OUT');

-- CreateEnum
CREATE TYPE "ScanType" AS ENUM ('IN', 'OUT', 'AUDIT');

-- CreateEnum
CREATE TYPE "ScanResult" AS ENUM ('CREATED', 'RETURNED', 'DUPLICATE', 'PRODUCT_MISMATCH', 'OK', 'ALREADY_OUT', 'UNKNOWN_SERIAL', 'NOT_IN_SCOPE', 'FOUND_BUT_OUT');

-- CreateEnum
CREATE TYPE "OutReason" AS ENUM ('SALE', 'INTERNAL_USE', 'DAMAGED', 'RETURN_SUPPLIER', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerialUnit" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'IN_STOCK',
    "receivedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "lastScanAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SerialUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanLog" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "type" "ScanType" NOT NULL,
    "result" "ScanResult" NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "message" TEXT,
    "reason" "OutReason",
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "productId" TEXT,
    "unitId" TEXT,
    "auditSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditSession" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'OPEN',
    "categoryId" TEXT,
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "note" TEXT,
    "report" JSONB,

    CONSTRAINT "AuditSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Category_code_key" ON "Category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "SerialUnit_serial_key" ON "SerialUnit"("serial");

-- CreateIndex
CREATE INDEX "SerialUnit_productId_status_idx" ON "SerialUnit"("productId", "status");

-- CreateIndex
CREATE INDEX "SerialUnit_status_idx" ON "SerialUnit"("status");

-- CreateIndex
CREATE INDEX "ScanLog_type_createdAt_idx" ON "ScanLog"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ScanLog_serial_idx" ON "ScanLog"("serial");

-- CreateIndex
CREATE INDEX "ScanLog_auditSessionId_idx" ON "ScanLog"("auditSessionId");

-- CreateIndex
CREATE INDEX "ScanLog_userId_createdAt_idx" ON "ScanLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditSession_status_startedAt_idx" ON "AuditSession"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialUnit" ADD CONSTRAINT "SerialUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SerialUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_auditSessionId_fkey" FOREIGN KEY ("auditSessionId") REFERENCES "AuditSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditSession" ADD CONSTRAINT "AuditSession_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditSession" ADD CONSTRAINT "AuditSession_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

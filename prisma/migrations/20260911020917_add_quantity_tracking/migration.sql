-- CreateEnum
CREATE TYPE "TrackingType" AS ENUM ('SERIAL', 'QUANTITY');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "stockQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trackingType" "TrackingType" NOT NULL DEFAULT 'SERIAL',
ADD COLUMN     "unitLabel" TEXT;

-- AlterTable
ALTER TABLE "ScanLog" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "serial" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "photosEnabled" BOOLEAN NOT NULL DEFAULT false;

-- เปิดเก็บรูปอุปกรณ์ให้ประเภท NVR ที่มีอยู่แล้ว (ประเภทอื่นผู้ดูแลระบบเปิดเองได้)
UPDATE "Category" SET "photosEnabled" = true WHERE code = 'NVR';

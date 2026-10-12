-- AuditSession.categoryIds/productIds เป็น required ตาม schema (ข้อมูลเดิม backfill [] ไว้แล้ว)
ALTER TABLE "AuditSession" ALTER COLUMN "categoryIds" SET NOT NULL;
ALTER TABLE "AuditSession" ALTER COLUMN "productIds" SET NOT NULL;

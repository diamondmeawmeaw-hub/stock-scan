# แผนแก้ 2 บัค: undo race + รายงานคืนของตามลูกค้า

**สถานะ:** แก้โค้ดและทดสอบผ่านแล้ว — commit 2026-10-30 (ยังไม่ push)  
**วันที่:** 2026-10-29  
**ที่มา:** ผลตรวจหาบัค read-only

## เป้าหมาย

แก้บัค 2 ข้อที่กระทบความถูกต้องของสต็อกและรายงาน:

1. ปุ่มยกเลิกรับเข้าไม่ล็อก serial ทำให้เกิด race กับการเบิกออก
2. รายงานเบิกออกตามลูกค้าไม่หักยอดคืนของสินค้าแบบนับจำนวน

## ขอบเขต

### บัค 1: ยกเลิกรับเข้าไม่ล็อก serial

**ไฟล์หลัก:**
- `src/app/api/scan/undo/route.ts`
- `src/lib/scan-service.ts` (`lockSerial`)

**สิ่งที่จะทำ:**
- เพิ่ม advisory lock ด้วย serial เดียวกับ `scanIn`/`scanOut` ก่อนอ่านสถานะ `SerialUnit` ใน transaction
- อ่านสถานะ unit และ log หลังจากได้ lock แล้วเท่านั้น
- รักษา error เดิม (`404`/`409`) เมื่อของถูกเบิกออกไปแล้ว
- เพิ่ม integration test จำลอง undo กับ scan-out พร้อมกัน หรืออย่างน้อยทดสอบว่า undo ไม่ลบ unit ที่มี OUT log หลังจากนั้น

**เกณฑ์ผ่าน:**
- ถ้ามีการเบิกออกเกิดขึ้นก่อน undo commit → undo ต้องไม่ลบ unit และต้องตอบ `409`
- ไม่มีเคสที่ OUT log สำเร็จแต่ `SerialUnit` หายไป

### บัค 2: รายงานลูกค้าไม่หักยอดคืน (QUANTITY)

**ไฟล์หลัก:**
- `src/lib/scan-service.ts` (`returnOut`, `sumOutQuantity`)

**สิ่งที่จะทำ:**
- ตอน `returnOut` สร้าง log `IN / RETURNED` ให้คัดลอก `customerId` และ `projectId` จากรายการเบิกเดิม
- ตรวจว่า `sumOutQuantity` หักยอดคืนได้ถูกต้องเมื่อกรอง `customerId`
- เพิ่ม integration test:
  - ขาย 4 → คืน 4 → ขาย 2 → รายงานลูกค้า A ต้องได้ 2
  - ขาย A 10 → ขาย B 10 → B คืน 10 → รายงาน A ต้องยังได้ 10
- เตรียม SQL backfill สำหรับ log คืนเก่าที่ `customerId` เป็น `NULL` แต่ **ยังไม่รันจนกว่าจะได้รับอนุญาต**

**เกณฑ์ผ่าน:**
- รายงานลูกค้าแสดงยอดเบิกสุทธิถูกต้อง
- ยอดคืนของลูกค้าคนอื่นไม่ไปหักยอดของลูกค้าที่กำลังดู
- `stockQty` ยังถูกต้องเหมือนเดิม

## คำสั่งตรวจสอบ

```bash
npx tsc --noEmit
npm test
npm run test:integration
npm run build
```

## ข้อกำหนด

- ไม่แก้ schema ถ้าไม่จำเป็น
- ไม่รัน SQL เขียนข้อมูลจริงระหว่างพัฒนา
- ไม่ commit/push จนกว่าจะตรวจผ่านและได้รับอนุญาต
- รักษาพฤติกรรม STAFF ที่แก้ master data / ปิด audit ได้ตามที่ตกลงไว้

## ลำดับทำงาน

- [x] 1. เขียน integration test ตรวจว่า undo ถือ serial advisory lock ตอนลบ unit
- [x] 2. เพิ่ม lock ใน undo route (export `lockSerial` จาก `scan-service`)
- [x] 3. เขียน integration test ของรายงานคืนตามลูกค้า (รวมเคสข้อมูลเก่า `customerId = NULL`)
- [x] 4. คัดลอก `customerId`/`projectId` ใน `returnOut` และให้ `sumOutQuantity` อ่าน customer จากรายการเบิกเดิมผ่าน `reverses` เป็น fallback
- [x] 5. รัน typecheck + unit + integration + build
- [x] 6. รัน e2e เฉพาะ flow ที่เกี่ยวข้อง + Docker build + ตรวจ Node ใน image
- [x] 7. สรุปผลและ commit (รอ push)

## ผลตรวจสอบล่าสุด (2026-10-30)

- `npx tsc --noEmit` ผ่าน
- `npm test` ผ่าน
- `npm run test:integration` ผ่าน **233 tests** (1 skipped ตามเดิม)
- `npm run build` ผ่าน
- `npx playwright test` (quantity / return-audit / sales-project / scan-in) ผ่าน **22 tests**
- `docker build -t stock-scan:local .` ผ่าน
- `docker run --rm --entrypoint node stock-scan:local -v` → `v24.22.1`
- ไม่มี schema change และไม่ได้รัน SQL เขียนข้อมูลจริง
- ข้อมูลคืนเก่าที่ `customerId = NULL` ถูกอ่านผ่าน `reverses.customerId` แล้ว จึงไม่จำเป็นต้องรัน backfill เพื่อให้รายงานถูกต้อง (แต่ยังทำได้ถ้าต้องการ normalize ข้อมูล)

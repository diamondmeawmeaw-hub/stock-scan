/**
 * ข้อมูลตัวอย่างสำหรับพัฒนา/ทดลองใช้ - รันซ้ำได้ (upsert ล้วน)
 * รหัสผ่าน: admin/admin123, staff/staff123 -- ห้ามใช้บนเครื่องที่ใช้งานจริง
 *
 * ไม่ได้ถูกเรียกตอน container start (ดู docker/entrypoint.sh)
 * ผู้ดูแลระบบคนแรกของเครื่องจริงสร้างด้วย prisma/bootstrap-admin.ts แทน
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // กันเผลอรันทับข้อมูลจริง - รหัสในไฟล์นี้เป็นรหัสที่รู้กันทั่ว
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'seed นี้มีรหัสผ่านตัวอย่างที่รู้กันทั่ว จึงไม่รันบน production\n' +
        'ต้องการจริงๆ ให้ตั้ง ALLOW_DEMO_SEED=true'
    )
  }

  const [adminHash, staffHash] = await Promise.all([
    bcrypt.hash('admin123', 10),
    bcrypt.hash('staff123', 10),
  ])

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminHash,
      displayName: 'ผู้ดูแลระบบ',
      role: 'ADMIN',
    },
  })

  await prisma.user.upsert({
    where: { username: 'staff' },
    update: {},
    create: {
      username: 'staff',
      passwordHash: staffHash,
      displayName: 'พนักงานคลัง',
      role: 'STAFF',
    },
  })

  const categories = [
    { code: 'AP', name: 'Access Point' },
    { code: 'SW', name: 'Switch' },
    { code: 'RT', name: 'Router / Firewall' },
    { code: 'CAM', name: 'กล้องวงจรปิด' },
    { code: 'NVR', name: 'เครื่องบันทึกกล้อง (NVR)' },
    { code: 'CBL', name: 'สายแลน / สายสัญญาณ' },
    { code: 'FBR', name: 'อุปกรณ์ไฟเบอร์' },
    { code: 'RACK', name: 'ตู้แร็ค / อุปกรณ์ติดตั้ง' },
    { code: 'PWR', name: 'อุปกรณ์จ่ายไฟ / UPS' },
    { code: 'ACC', name: 'อุปกรณ์เสริม' },
  ]
  const categoryByCode = new Map<string, string>()
  for (const c of categories) {
    const saved = await prisma.category.upsert({
      where: { code: c.code },
      update: { name: c.name },
      create: c,
    })
    categoryByCode.set(c.code, saved.id)
  }

  const products = [
    { sku: 'AP-UNF-U6L', name: 'UniFi U6 Lite Access Point', brand: 'UniFi', category: 'AP' },
    { sku: 'AP-UNF-U6P', name: 'UniFi U6 Pro Access Point', brand: 'UniFi', category: 'AP' },
    { sku: 'SW-UNF-24P', name: 'UniFi Switch 24 พอร์ต PoE', brand: 'UniFi', category: 'SW' },
    { sku: 'SW-CIS-8P', name: 'Cisco CBS110 8 พอร์ต', brand: 'Cisco', category: 'SW' },
    { sku: 'RT-UNF-UDMP', name: 'UniFi Dream Machine Pro', brand: 'UniFi', category: 'RT' },
    { sku: 'CAM-HIK-D2', name: 'กล้อง Hikvision Dome 2MP', brand: 'Hikvision', category: 'CAM' },
    { sku: 'CAM-HIK-B4', name: 'กล้อง Hikvision Bullet 4MP', brand: 'Hikvision', category: 'CAM' },
    { sku: 'NVR-HIK-16', name: 'NVR Hikvision 16 ช่อง', brand: 'Hikvision', category: 'NVR' },
    { sku: 'CBL-UTP-C6', name: 'สายแลน UTP Cat6 กล่อง 305 ม.', brand: 'Link', category: 'CBL' },
    { sku: 'CBL-PAT-C6-2M', name: 'สายแพทช์ Cat6 ยาว 2 ม.', brand: 'Link', category: 'CBL' },
    { sku: 'FBR-SFP-1G', name: 'SFP Module 1G Single-mode', brand: 'UniFi', category: 'FBR' },
    { sku: 'RACK-19-9U', name: 'ตู้แร็คแขวนผนัง 9U', brand: 'Germany Rack', category: 'RACK' },
    { sku: 'PWR-UPS-1KVA', name: 'UPS 1000VA', brand: 'APC', category: 'PWR' },
    { sku: 'ACC-POE-INJ', name: 'PoE Injector 48V', brand: 'UniFi', category: 'ACC' },
  ]
  const productBySku = new Map<string, string>()
  for (const p of products) {
    const saved = await prisma.product.upsert({
      where: { sku: p.sku },
      update: { name: p.name, brand: p.brand, categoryId: categoryByCode.get(p.category)! },
      create: {
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        categoryId: categoryByCode.get(p.category)!,
      },
    })
    productBySku.set(p.sku, saved.id)
  }

  // สร้าง serial ตัวอย่างให้พอมีของนับ
  const seedUnits: { sku: string; serials: string[] }[] = [
    { sku: 'AP-UNF-U6L', serials: ['AP6L0001', 'AP6L0002', 'AP6L0003', 'AP6L0004'] },
    { sku: 'AP-UNF-U6P', serials: ['AP6P0001', 'AP6P0002'] },
    { sku: 'SW-UNF-24P', serials: ['SW24P001', 'SW24P002'] },
    { sku: 'SW-CIS-8P', serials: ['SW8P0001'] },
    { sku: 'RT-UNF-UDMP', serials: ['UDMP0001'] },
    { sku: 'CAM-HIK-D2', serials: ['CAMD0001', 'CAMD0002', 'CAMD0003', 'CAMD0004', 'CAMD0005'] },
    { sku: 'CAM-HIK-B4', serials: ['CAMB0001', 'CAMB0002', 'CAMB0003'] },
    { sku: 'NVR-HIK-16', serials: ['NVR16001'] },
    { sku: 'CBL-UTP-C6', serials: ['CBLC60001', 'CBLC60002', 'CBLC60003'] },
    { sku: 'CBL-PAT-C6-2M', serials: ['PAT2M001', 'PAT2M002', 'PAT2M003', 'PAT2M004'] },
    { sku: 'FBR-SFP-1G', serials: ['SFP1G001', 'SFP1G002'] },
    { sku: 'RACK-19-9U', serials: ['RACK9U01'] },
    { sku: 'PWR-UPS-1KVA', serials: ['UPS1K001', 'UPS1K002'] },
    { sku: 'ACC-POE-INJ', serials: ['POEINJ01', 'POEINJ02'] },
  ]

  const now = new Date()
  for (const group of seedUnits) {
    for (const serial of group.serials) {
      await prisma.serialUnit.upsert({
        where: { serial },
        update: {},
        create: {
          serial,
          productId: productBySku.get(group.sku)!,
          status: 'IN_STOCK',
          receivedAt: now,
        },
      })
    }
  }

  const unitCount = await prisma.serialUnit.count()
  console.log(
    `seed เสร็จแล้ว: ${categories.length} ประเภทของ, ${products.length} สินค้า, ${unitCount} ชิ้น (admin id: ${admin.id})`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

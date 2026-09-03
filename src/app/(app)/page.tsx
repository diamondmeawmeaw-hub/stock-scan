import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [inStock, out, productCount, categoryCount, openSession, recentScans] = await Promise.all([
    prisma.serialUnit.count({ where: { status: 'IN_STOCK' } }),
    prisma.serialUnit.count({ where: { status: 'OUT' } }),
    prisma.product.count(),
    prisma.category.count(),
    prisma.auditSession.findFirst({ where: { status: 'OPEN' }, include: { category: true } }),
    prisma.scanLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { displayName: true } }, product: true },
    }),
  ])

  const typeLabel = { IN: 'รับเข้า', OUT: 'เบิกออก', AUDIT: 'ตรวจนับ' } as const

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="ของในคลัง (ชิ้น)" value={inStock} tone="emerald" />
        <Stat label="เบิกออกไปแล้ว (ชิ้น)" value={out} />
        <Stat label="รายการสินค้า" value={productCount} />
        <Stat label="ประเภทของ" value={categoryCount} />
      </div>

      {openSession && (
        <div className="card border-amber-300 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="font-medium">
                มีรอบตรวจนับที่เปิดค้างอยู่: {openSession.name}
              </div>
              <div className="text-sm text-slate-600">
                ขอบเขต: {openSession.category?.name ?? 'ทั้งคลัง'}
              </div>
            </div>
            <Link href={`/audit/${openSession.id}`} className="btn-primary ml-auto">
              ไปที่รอบตรวจนับ
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <ActionCard href="/scan-in" title="รับเข้าสต็อก" desc="เลือกสินค้า แล้วยิง serial รัวๆ" />
        <ActionCard href="/scan-out" title="เบิกออก" desc="ยิง serial ที่จะเบิกออกจากคลัง" />
        <ActionCard href="/audit" title="ตรวจนับสต็อก" desc="เทียบของจริงกับที่ระบบมี" />
      </div>

      <div className="card overflow-hidden">
        <h2 className="border-b border-slate-200 px-4 py-3 font-medium">การสแกนล่าสุด</h2>
        {recentScans.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">ยังไม่มีการสแกน</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">เวลา</th>
                <th className="px-4 py-2 font-medium">ประเภท</th>
                <th className="px-4 py-2 font-medium">Serial</th>
                <th className="px-4 py-2 font-medium">สินค้า</th>
                <th className="px-4 py-2 font-medium">ผู้สแกน</th>
                <th className="px-4 py-2 font-medium">ผล</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentScans.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                    {log.createdAt.toLocaleString('th-TH', {
                      timeZone: 'Asia/Bangkok',
                        })}
                  </td>
                  <td className="px-4 py-2">{typeLabel[log.type]}</td>
                  <td className="px-4 py-2 font-mono">{log.serial}</td>
                  <td className="px-4 py-2 text-slate-600">{log.product?.name ?? '-'}</td>
                  <td className="px-4 py-2 text-slate-600">{log.user.displayName}</td>
                  <td
                    className={`px-4 py-2 ${
                      log.result === 'MISSING'
                        ? 'text-amber-700'
                        : log.accepted
                          ? 'text-emerald-700'
                          : 'text-red-700'
                    }`}
                  >
                    {log.message ?? log.result}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'slate',
}: {
  label: string
  value: number
  tone?: 'slate' | 'emerald'
}) {
  return (
    <div className="card p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div
        className={`mt-1 text-3xl font-semibold ${tone === 'emerald' ? 'text-emerald-600' : ''}`}
      >
        {value.toLocaleString('th-TH')}
      </div>
    </div>
  )
}

function ActionCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="card p-4 transition hover:border-slate-400 hover:shadow">
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{desc}</div>
    </Link>
  )
}

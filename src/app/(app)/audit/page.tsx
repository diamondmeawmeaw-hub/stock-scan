import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { NewAuditForm } from './NewAuditForm'

export const dynamic = 'force-dynamic'

export default async function AuditListPage() {
  const [sessions, categories, products] = await Promise.all([
    prisma.auditSession.findMany({
      orderBy: { startedAt: 'desc' },
      take: 30,
      include: {
        category: true,
        startedBy: { select: { displayName: true } },
        _count: { select: { scans: { where: { accepted: true } } } },
      },
    }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.product.findMany({
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      include: { category: { select: { id: true, name: true } } },
    }),
  ])

  const openSession = sessions.find((s) => s.status === 'OPEN') ?? null
  const categoryName = new Map(categories.map((c) => [c.id, c.name] as const))
  const productName = new Map(products.map((p) => [p.id, p.name] as const))

  /** ชื่อขอบเขตแบบย่อ - รอบเก่าใช้ประเภทเดียว รอบใหม่รวมที่ติ๊กไว้ */
  function scopeLabel(s: {
    categoryId: string | null
    categoryIds: string[]
    productIds: string[]
    category?: { name: string } | null
  }): string {
    if (s.categoryId) return s.category?.name ?? categoryName.get(s.categoryId) ?? 'ทั้งคลัง'
    const parts = [
      ...(s.categoryIds ?? []).map((id) => categoryName.get(id) ?? '?'),
      ...(s.productIds ?? []).map((id) => productName.get(id) ?? '?'),
    ]
    if (parts.length === 0) return 'ทั้งคลัง'
    if (parts.length <= 2) return parts.join(', ')
    return `${parts.slice(0, 2).join(', ')} + อีก ${parts.length - 2} รายการ`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">ตรวจนับสต็อก</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          เปิดรอบนับ ยิงของจริงในคลังให้ครบ แล้วปิดรอบเพื่อดูว่าอะไรหาย อะไรเกิน
        </p>
      </div>

      {openSession ? (
        <div className="card border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="font-medium">กำลังนับ: {openSession.name}</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                ขอบเขต {scopeLabel(openSession)} · ยิงแล้ว{' '}
                {openSession._count.scans} ชิ้น
              </div>
            </div>
            <Link href={`/audit/${openSession.id}`} className="btn-primary ml-auto">
              ไปยิงต่อ
            </Link>
          </div>
        </div>
      ) : (
        <NewAuditForm
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          products={products.map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            categoryId: p.categoryId,
            categoryName: p.category.name,
          }))}
        />
      )}

      <div className="card overflow-hidden">
        <h2 className="border-b border-slate-200 px-4 py-3 font-medium dark:border-slate-700">ประวัติการตรวจนับ</h2>
        {sessions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">ยังไม่เคยตรวจนับ</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">รอบ</th>
                <th className="px-4 py-2 font-medium">ขอบเขต</th>
                <th className="px-4 py-2 font-medium">เริ่มโดย</th>
                <th className="px-4 py-2 font-medium">เริ่มเมื่อ</th>
                <th className="px-4 py-2 font-medium">ยิงแล้ว</th>
                <th className="px-4 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-2">
                    <Link href={`/audit/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{scopeLabel(s)}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{s.startedBy.displayName}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500 dark:text-slate-400">
                    {s.startedAt.toLocaleString('th-TH', {
                      timeZone: 'Asia/Bangkok',
                        })}
                  </td>
                  <td className="px-4 py-2">{s._count.scans}</td>
                  <td className="px-4 py-2">
                    {s.status === 'OPEN' ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        กำลังนับ
                      </span>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        ปิดรอบแล้ว
                      </span>
                    )}
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

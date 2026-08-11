import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { NewAuditForm } from './NewAuditForm'

export const dynamic = 'force-dynamic'

export default async function AuditListPage() {
  const [sessions, categories] = await Promise.all([
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
  ])

  const openSession = sessions.find((s) => s.status === 'OPEN') ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">ตรวจนับสต็อก</h1>
        <p className="text-sm text-slate-500">
          เปิดรอบนับ ยิงของจริงในคลังให้ครบ แล้วปิดรอบเพื่อดูว่าอะไรหาย อะไรเกิน
        </p>
      </div>

      {openSession ? (
        <div className="card border-amber-300 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="font-medium">กำลังนับ: {openSession.name}</div>
              <div className="text-sm text-slate-600">
                ขอบเขต {openSession.category?.name ?? 'ทั้งคลัง'} · ยิงแล้ว{' '}
                {openSession._count.scans} ชิ้น
              </div>
            </div>
            <Link href={`/audit/${openSession.id}`} className="btn-primary ml-auto">
              ไปยิงต่อ
            </Link>
          </div>
        </div>
      ) : (
        <NewAuditForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
      )}

      <div className="card overflow-hidden">
        <h2 className="border-b border-slate-200 px-4 py-3 font-medium">ประวัติการตรวจนับ</h2>
        {sessions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">ยังไม่เคยตรวจนับ</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">รอบ</th>
                <th className="px-4 py-2 font-medium">ขอบเขต</th>
                <th className="px-4 py-2 font-medium">เริ่มโดย</th>
                <th className="px-4 py-2 font-medium">เริ่มเมื่อ</th>
                <th className="px-4 py-2 font-medium">ยิงแล้ว</th>
                <th className="px-4 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/audit/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{s.category?.name ?? 'ทั้งคลัง'}</td>
                  <td className="px-4 py-2 text-slate-600">{s.startedBy.displayName}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                    {s.startedAt.toLocaleString('th-TH', {
                      timeZone: 'Asia/Bangkok',
                        })}
                  </td>
                  <td className="px-4 py-2">{s._count.scans}</td>
                  <td className="px-4 py-2">
                    {s.status === 'OPEN' ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                        กำลังนับ
                      </span>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
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

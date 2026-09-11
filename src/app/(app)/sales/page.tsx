import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { dayRange, shiftDays, todayInThailand } from '@/lib/date-range'
import { listCustomers } from '@/lib/scan-service'
import { SalesFilters } from './SalesFilters'

export const dynamic = 'force-dynamic'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function one(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key]
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export default async function SalesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const customerId = one(params, 'customerId')
  const q = one(params, 'q')
  const rawFrom = one(params, 'from')
  const rawTo = one(params, 'to')

  const today = todayInThailand()
  const from = DATE_PATTERN.test(rawFrom) ? rawFrom : ''
  const to = DATE_PATTERN.test(rawTo) ? rawTo : ''

  const customers = await listCustomers()

  // ── สร้าง where clause ──
  const where: Record<string, unknown> = {
    type: 'OUT',
    reason: 'SALE',
    accepted: true,
  }

  if (customerId) {
    where.customerId = customerId
  }

  if (from || to) {
    const [start, end] = from && to
      ? (from <= to ? [from, to] : [to, from])
      : [from || to, from || to]
    const range = dayRange(start, end)
    where.createdAt = { gte: range.from, lte: range.to }
  }

  if (q) {
    const search = { contains: q, mode: 'insensitive' as const }
    where.OR = [
      { serial: search },
      { product: { name: search } },
      { product: { sku: search } },
      { customer: { name: search } },
      { customer: { code: search } },
      { note: search },
    ]
  }

  const logs = await prisma.scanLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { customer: true, product: true, user: true },
  })

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-blue-50/60 to-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
            <CartIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">ประวัติการขาย</h1>
            <p className="text-sm text-slate-500">
              รายการเบิกออกที่มีเหตุผลเป็นขาย · {logs.length} รายการ
            </p>
          </div>
        </div>
      </div>

      <SalesFilters customers={customers} values={{ customerId, q, from, to }} />

      {logs.length === 0 ? (
        <p
          className="rounded-2xl border border-sky-100 bg-white p-6 text-sm text-slate-500 shadow-sm"
          data-testid="sales-empty"
        >
          ไม่พบประวัติการขายตามเงื่อนไขที่เลือก
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">เวลา</th>
                  <th className="px-4 py-2 font-medium">ลูกค้า</th>
                  <th className="px-4 py-2 font-medium">Serial</th>
                  <th className="px-4 py-2 font-medium">สินค้า</th>
                  <th className="px-4 py-2 font-medium">ผู้ทำรายการ</th>
                  <th className="px-4 py-2 font-medium">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} data-testid="sale-row">
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                      {log.createdAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
                    </td>
                    <td className="px-4 py-2">
                      {log.customer ? `${log.customer.code} · ${log.customer.name}` : '-'}
                    </td>
                    <td className="px-4 py-2">
                      {log.serial ? (
                        <Link
                          className="font-mono text-sky-700 underline"
                          href={`/serials?serial=${encodeURIComponent(log.serial)}`}
                        >
                          {log.serial}
                        </Link>
                      ) : (
                        <span className="text-slate-500">
                          {log.product?.name ?? '-'} × {log.quantity}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{log.product?.name ?? '-'}</td>
                    <td className="px-4 py-2">{log.user.displayName}</td>
                    <td className="px-4 py-2">{log.note ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function CartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'h-5 w-5'}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  )
}

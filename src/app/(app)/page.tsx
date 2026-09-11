import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [serialInStock, serialOut, qtyInStock, qtyOut, productCount, categoryCount, openSession, recentScans] = await Promise.all([
    prisma.serialUnit.count({ where: { status: 'IN_STOCK' } }),
    prisma.serialUnit.count({ where: { status: 'OUT' } }),
    prisma.product.aggregate({
      where: { trackingType: 'QUANTITY' },
      _sum: { stockQty: true },
    }),
    prisma.scanLog.groupBy({
      by: ['type'],
      where: {
        accepted: true,
        type: 'OUT',
        product: { trackingType: 'QUANTITY' },
      },
      _sum: { quantity: true },
    }),
    prisma.product.count(),
    prisma.category.count(),
    prisma.auditSession.findFirst({ where: { status: 'OPEN' }, include: { category: true } }),
    prisma.scanLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { displayName: true } }, product: true },
    }),
  ])
  const inStock = serialInStock + (qtyInStock._sum.stockQty ?? 0)
  const out = serialOut + (qtyOut.find((g) => g.type === 'OUT')?._sum.quantity ?? 0)

  const now = new Date()
  const todayText = now.toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const nowTime = now.toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="relative overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-b from-sky-50 via-blue-50/60 to-white p-5 text-slate-800 shadow-lg sm:p-7">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-blue-200/30 blur-3xl" />

      <div className="relative space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-sky-600">ระบบเช็คสต็อกด้วยการสแกน serial</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              ภาพรวมคลังสินค้า
            </h1>
            <p className="mt-2 max-w-md text-sm text-slate-500">
              รับเข้า เบิกออก ตรวจนับ ได้ในหน้าจอเดียว 
            </p>
          </div>
          <div className="rounded-xl border border-sky-100 bg-white/70 px-4 py-2 text-right shadow-sm">
            <div className="text-sm font-medium text-sky-700">{todayText}</div>
            <div className="text-xs text-slate-500">{nowTime} น.</div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={<PackageIcon />} accent="bg-sky-100 text-sky-600" label="ของในคลัง (ชิ้น)" value={inStock} />
          <Stat icon={<SendIcon />} accent="bg-blue-100 text-blue-600" label="เบิกออกไปแล้ว (ชิ้น)" value={out} />
          <Stat icon={<TagIcon />} accent="bg-indigo-100 text-indigo-600" label="รายการสินค้า" value={productCount} />
          <Stat icon={<LayersIcon />} accent="bg-cyan-100 text-cyan-600" label="ประเภทของ" value={categoryCount} />
        </div>

        {openSession && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
            <div>
              <div className="font-medium">มีรอบตรวจนับที่เปิดค้างอยู่: {openSession.name}</div>
              <div className="text-sm text-amber-700/80">
                ขอบเขต: {openSession.category?.name ?? 'ทั้งคลัง'}
              </div>
            </div>
            <Link
              href={`/audit/${openSession.id}`}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
            >
              ไปที่รอบตรวจนับ
            </Link>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <ActionCard
            href="/scan-in"
            title="รับเข้าสต็อก"
            desc="เลือกสินค้า แล้วยิง serial รัวๆ"
            icon={<ScanInIcon />}
            accent="bg-sky-100 text-sky-600"
          />
          <ActionCard
            href="/scan-out"
            title="เบิกออก"
            desc="ยิง serial ที่จะเบิกออกจากคลัง"
            icon={<ScanOutIcon />}
            accent="bg-blue-100 text-blue-600"
          />
          <ActionCard
            href="/audit"
            title="ตรวจนับสต็อก"
            desc="เทียบของจริงกับที่ระบบมี"
            icon={<ClipboardCheckIcon />}
            accent="bg-amber-100 text-amber-600"
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
          <h2 className="border-b border-slate-100 px-4 py-3 font-medium">การสแกนล่าสุด</h2>
          {recentScans.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">ยังไม่มีการสแกน</p>
          ) : (
            <div className="overflow-x-auto">
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
                        {log.createdAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
                      </td>
                      <td className="px-4 py-2">
                        <TypeBadge type={log.type} />
                      </td>
                      <td className="px-4 py-2 font-mono text-slate-800">
                        {log.serial ?? (log.quantity > 1 ? `× ${log.quantity}` : '—')}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{log.product?.name ?? '-'}</td>
                      <td className="px-4 py-2 text-slate-600">{log.user.displayName}</td>
                      <td
                        className={`px-4 py-2 font-medium ${
                          log.result === 'MISSING'
                            ? 'text-amber-600'
                            : log.accepted
                              ? 'text-emerald-600'
                              : 'text-red-600'
                        }`}
                      >
                        {log.message ?? log.result}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const TYPE_STYLES = {
  IN: 'bg-emerald-100 text-emerald-700',
  OUT: 'bg-sky-100 text-sky-700',
  AUDIT: 'bg-amber-100 text-amber-700',
} as const

const TYPE_LABELS = { IN: 'รับเข้า', OUT: 'เบิกออก', AUDIT: 'ตรวจนับ' } as const

function TypeBadge({ type }: { type: keyof typeof TYPE_LABELS }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[type]}`}>
      {TYPE_LABELS[type]}
    </span>
  )
}

function Stat({
  icon,
  accent,
  label,
  value,
}: {
  icon: React.ReactNode
  accent: string
  label: string
  value: number
}) {
  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent}`}>{icon}</span>
        <span className="text-sm text-slate-500">{label}</span>
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums text-slate-900">
        {value.toLocaleString('th-TH')}
      </div>
    </div>
  )
}

function ActionCard({
  href,
  title,
  desc,
  icon,
  accent,
}: {
  href: string
  title: string
  desc: string
  icon: React.ReactNode
  accent: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm transition hover:border-sky-300 hover:shadow-md"
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${accent}`}>
        {icon}
      </span>
      <span className="flex-1">
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="mt-1 block text-sm text-slate-500">{desc}</span>
      </span>
      <ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-sky-600" />
    </Link>
  )
}

function iconProps() {
  return {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    className: 'h-5 w-5',
  }
}

function PackageIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42Z" />
      <circle cx="7.5" cy="7.5" r="0.5" fill="currentColor" />
    </svg>
  )
}

function LayersIcon() {
  return (
    <svg {...iconProps()}>
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </svg>
  )
}

function ScanInIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  )
}

function ScanOutIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  )
}

function ClipboardCheckIcon() {
  return (
    <svg {...iconProps()}>
      <path d="m3 17 2 2 4-4" />
      <path d="m3 7 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </svg>
  )
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      {...iconProps()}
      className={className ?? 'h-5 w-5'}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

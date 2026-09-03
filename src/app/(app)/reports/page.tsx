import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { dayRange, shiftDays, todayInThailand } from '@/lib/date-range'
import { buildMovementReport, buildStockReport, listBrands, listVendors } from '@/lib/scan-service'
import { ReportFilters } from './ReportFilters'

export const dynamic = 'force-dynamic'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function one(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key]
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const view = one(params, 'view') === 'movement' ? 'movement' : 'stock'
  const categoryId = one(params, 'categoryId')
  const brand = one(params, 'brand')
  const vendorId = one(params, 'vendorId')
  const q = one(params, 'q')

  const today = todayInThailand()
  const rawFrom = one(params, 'from')
  const rawTo = one(params, 'to')
  const from = DATE_PATTERN.test(rawFrom) ? rawFrom : shiftDays(today, -6)
  const to = DATE_PATTERN.test(rawTo) ? rawTo : today
  // เลือกช่วงกลับหัวมา (from > to) ก็ไม่ต้องเออเรอร์ สลับให้เลย
  const [start, end] = from <= to ? [from, to] : [to, from]

  const filters = { categoryId, brand, vendorId, q }
  const [categories, brands, vendors] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listBrands(),
    listVendors(),
  ])

  // ปุ่มโหลดไฟล์อิงตัวกรองใน URL (สิ่งที่เห็นบนจอจริง) ไม่ใช่ state ในฟอร์มที่ยังไม่กดดู
  const exportHref = (format: 'xlsx' | 'pdf') =>
    `/api/reports/export?${queryString({
      ...filters,
      view,
      format,
      ...(view === 'movement' ? { from: start, to: end } : {}),
    })}`

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-blue-50/60 to-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
            <BarChartIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">รายงาน</h1>
            <p className="text-sm text-slate-500">
              กรองตามประเภทของ แบรนด์ ผู้ขาย หรือค้นหาชื่อ/SKU · ดูยอดคงเหลือหรือความเคลื่อนไหวตามช่วงวัน
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav
          className="inline-flex gap-1 rounded-xl border border-sky-100 bg-sky-50/70 p-1"
          data-testid="report-tabs"
        >
          <Tab
            href={{ ...filters, view: 'stock' }}
            active={view === 'stock'}
            label="ยอดคงเหลือ"
            testId="tab-stock"
          />
          <Tab
            href={{ ...filters, view: 'movement', from: start, to: end }}
            active={view === 'movement'}
            label="ความเคลื่อนไหว"
            testId="tab-movement"
          />
        </nav>

        <div className="flex gap-2">
          <a
            href={exportHref('xlsx')}
            data-testid="export-xlsx"
            className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-sky-50"
          >
            <DownloadIcon className="h-4 w-4 text-emerald-600" />
            โหลด Excel
          </a>
          <a
            href={exportHref('pdf')}
            data-testid="export-pdf"
            className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-sky-50"
          >
            <FileTextIcon className="h-4 w-4 text-red-600" />
            โหลด PDF
          </a>
        </div>
      </div>

      <ReportFilters
        categories={categories}
        brands={brands}
        vendors={vendors}
        view={view}
        values={{ categoryId, brand, vendorId, q, from: start, to: end }}
      />

      {view === 'stock' ? (
        <StockView filters={filters} />
      ) : (
        <MovementView filters={filters} from={start} to={end} />
      )}
    </div>
  )
}

/** ตัดค่าว่างทิ้งเพื่อไม่ให้ URL รกด้วยพารามิเตอร์เปล่า */
function queryString(values: Record<string, string>): string {
  return new URLSearchParams(Object.entries(values).filter(([, v]) => v)).toString()
}

function Tab({
  href,
  active,
  label,
  testId,
}: {
  href: Record<string, string>
  active: boolean
  label: string
  testId: string
}) {
  const query = queryString(href)
  return (
    <Link
      href={`/reports${query ? `?${query}` : ''}`}
      data-testid={testId}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active
          ? 'bg-sky-600 text-white shadow-sm'
          : 'text-slate-600 hover:bg-white/70'
      }`}
    >
      {label}
    </Link>
  )
}

type ViewFilters = { categoryId: string; brand: string; vendorId: string; q: string }

async function StockView({ filters }: { filters: ViewFilters }) {
  const { categories, grandTotalInStock } = await buildStockReport(filters)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-sm">
        <span className="text-sm text-slate-500">
          ณ {new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
        </span>
        <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800">
          รวม
          <b className="tabular-nums text-sky-900" data-testid="grand-total">
            {grandTotalInStock.toLocaleString('th-TH')}
          </b>
          ชิ้น
        </span>
      </div>

      {categories.length === 0 && (
        <p
          className="rounded-2xl border border-sky-100 bg-white p-6 text-sm text-slate-500 shadow-sm"
          data-testid="stock-empty"
        >
          ไม่พบสินค้าตามเงื่อนไขที่เลือก
        </p>
      )}

      {categories.map((c) => (
        <div
          key={c.categoryId}
          className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm"
          data-testid="report-category"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="font-medium text-slate-900">
              {c.categoryName} <span className="text-slate-400">({c.categoryCode})</span>
            </h2>
            <span className="text-sm text-slate-600">
              คงเหลือรวม <b className="text-slate-900">{c.totalInStock}</b> ชิ้น
            </span>
          </div>
          {c.products.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">ยังไม่มีสินค้าในประเภทนี้</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">SKU</th>
                    <th className="px-4 py-2 font-medium">สินค้า</th>
                    <th className="px-4 py-2 font-medium">แบรนด์</th>
                    <th className="px-4 py-2 text-right font-medium">คงเหลือ</th>
                    <th className="px-4 py-2 text-right font-medium">เบิกออกไปแล้ว</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {c.products.map((p) => (
                    <tr key={p.productId}>
                      <td className="px-4 py-2 font-mono text-slate-700">{p.sku}</td>
                      <td className="px-4 py-2">{p.name}</td>
                      <td className="px-4 py-2 text-slate-600">{p.brand ?? '-'}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">
                        {p.inStock}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-500">{p.out}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

async function MovementView({
  filters,
  from,
  to,
}: {
  filters: ViewFilters
  from: string
  to: string
}) {
  const report = await buildMovementReport({ ...filters, ...dayRange(from, to) })
  const thaiDate = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString('th-TH')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-sm">
        <span className="text-sm text-slate-500">
          {thaiDate(from)} - {thaiDate(to)}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
            รับเข้า <b className="tabular-nums text-emerald-900" data-testid="total-in">{report.totalIn.toLocaleString('th-TH')}</b> ชิ้น
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
            เบิกออก <b className="tabular-nums text-amber-900" data-testid="total-out">{report.totalOut.toLocaleString('th-TH')}</b> ชิ้น
          </span>
        </span>
      </div>

      {report.rows.length === 0 ? (
        <p
          className="rounded-2xl border border-sky-100 bg-white p-6 text-sm text-slate-500 shadow-sm"
          data-testid="movement-empty"
        >
          ช่วงวันที่นี้ไม่มีการรับเข้าหรือเบิกออก
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium">สินค้า</th>
                  <th className="px-4 py-2 font-medium">แบรนด์</th>
                  <th className="px-4 py-2 font-medium">ประเภทของ</th>
                  <th className="px-4 py-2 text-right font-medium">รับเข้า</th>
                  <th className="px-4 py-2 text-right font-medium">เบิกออก</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.rows.map((r) => (
                  <tr key={r.productId} data-testid="movement-row">
                    <td className="px-4 py-2 font-mono text-slate-700">{r.sku}</td>
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2 text-slate-600">{r.brand ?? '-'}</td>
                    <td className="px-4 py-2 text-slate-600">{r.categoryName}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums text-emerald-700">
                      {r.inCount || '-'}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums text-amber-700">
                      {r.outCount || '-'}
                    </td>
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

function BarChartIcon({ className }: { className?: string }) {
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
      <line x1="12" x2="12" y1="20" y2="10" />
      <line x1="18" x2="18" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="16" />
    </svg>
  )
}

function DownloadIcon({ className }: { className?: string }) {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  )
}

function FileTextIcon({ className }: { className?: string }) {
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
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  )
}
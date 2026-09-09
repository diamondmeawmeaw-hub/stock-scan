import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { dayRange, shiftDays, todayInThailand, type TimePeriod } from '@/lib/date-range'
import { buildMovementDetail, buildOutReport, buildStockReport, listBrands, listCustomers, listVendors } from '@/lib/scan-service'
import { ReportFilters } from './ReportFilters'
import { StockView } from './StockView'

export const dynamic = 'force-dynamic'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function one(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key]
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const viewParam = one(params, 'view')
  const view = viewParam === 'movement' ? 'movement' : viewParam === 'out' ? 'out' : 'stock'
  const categoryId = one(params, 'categoryId')
  const brand = one(params, 'brand')
  const vendorId = one(params, 'vendorId')
  const q = one(params, 'q')
  const customerId = one(params, 'customerId')
  const timePeriod = (one(params, 'timePeriod') || '30d') as TimePeriod

  const today = todayInThailand()
  const rawFrom = one(params, 'from')
  const rawTo = one(params, 'to')
  const from = DATE_PATTERN.test(rawFrom) ? rawFrom : shiftDays(today, -6)
  const to = DATE_PATTERN.test(rawTo) ? rawTo : today
  const [start, end] = from <= to ? [from, to] : [to, from]

  // Stock filters include timePeriod; Movement filters do NOT include timePeriod
  const stockFilters = { categoryId, brand, vendorId, q, customerId, timePeriod }
  const outFilters = { categoryId, brand, vendorId, q, customerId, timePeriod }
  const movementFilters = { categoryId, brand, vendorId, q, customerId }

  const [categories, brands, vendors, customers] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listBrands(),
    listVendors(),
    listCustomers(),
  ])

  const exportHref = (format: 'xlsx' | 'pdf') => {
    if (view === 'movement') {
      return `/api/reports/export?${queryString({
        ...movementFilters,
        view,
        format,
        from: start,
        to: end,
      })}`
    }
    return `/api/reports/export?${queryString({
      ...(view === 'out' ? outFilters : stockFilters),
      view,
      format,
    })}`
  }

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
              {view === 'stock'
                ? 'กรองตามประเภทของ แบรนด์ ผู้ซื้อ ช่วงเวลา หรือค้นหาชื่อ/SKU · ดูยอดคงเหลือแบบละเอียด'
                : 'ดูประวัติการเคลื่อนไหวของสินค้า · รับเข้า เบิกออก ตรวจนับ'}
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
            href={{ ...stockFilters, view: 'stock' }}
            active={view === 'stock'}
            label="ยอดคงเหลือ"
            testId="tab-stock"
          />
          <Tab
            href={{ ...movementFilters, view: 'movement', from: start, to: end }}
            active={view === 'movement'}
            label="ความเคลื่อนไหว"
            testId="tab-movement"
          />
          <Tab
            href={{ ...outFilters, view: 'out' }}
            active={view === 'out'}
            label="เบิกออกแล้ว"
            testId="tab-out"
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
        customers={customers}
        view={view}
        values={{
          categoryId,
          brand,
          vendorId,
          q,
          customerId,
          timePeriod: view === 'stock' ? timePeriod : '30d',
          from: start,
          to: end,
        }}
      />

      {view === 'stock' ? (
        <StockViewWithFilters stockFilters={stockFilters} />
      ) : view === 'out' ? (
        <OutViewWithFilters outFilters={outFilters} />
      ) : (
        <MovementView filters={movementFilters} from={start} to={end} />
      )}
    </div>
  )
}

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

type StockViewFilters = { categoryId: string; brand: string; vendorId: string; q: string; customerId: string; timePeriod: TimePeriod }
type MovementViewFilters = { categoryId: string; brand: string; vendorId: string; q: string; customerId: string }

async function StockViewWithFilters({ stockFilters }: { stockFilters: StockViewFilters }) {
  const { categories, grandTotalInStock } = await buildStockReport(stockFilters)

  return (
    <StockView
      categories={categories}
      grandTotalInStock={grandTotalInStock}
      filters={stockFilters}
      snapshotAt={new Date().toISOString()}
    />
  )
}

async function OutViewWithFilters({ outFilters }: { outFilters: StockViewFilters }) {
  const { categories, grandTotalOut } = await buildOutReport(outFilters)

  return (
    <StockView
      categories={categories.map((c) => ({
        categoryId: c.categoryId,
        categoryCode: c.categoryCode,
        categoryName: c.categoryName,
        products: c.products.map((p) => ({
          productId: p.productId,
          sku: p.sku,
          name: p.name,
          brand: p.brand,
          inStock: 0,
          out: p.out,
        })),
        totalInStock: 0,
      }))}
      grandTotalInStock={grandTotalOut}
      filters={outFilters}
      snapshotAt={new Date().toISOString()}
      serialMode="OUT"
      summaryLabel="เบิกออกรวม"
    />
  )
}

const SCAN_TYPE_LABEL: Record<string, string> = { IN: 'รับเข้า', OUT: 'เบิกออก', AUDIT: 'ตรวจนับ' }

async function MovementView({
  filters,
  from,
  to,
}: {
  filters: MovementViewFilters
  from: string
  to: string
}) {
  const report = await buildMovementDetail({ ...filters, ...dayRange(from, to) })
  const thaiDate = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString('th-TH')

  const thaiDateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-sm">
        <span className="text-sm text-slate-500">
          {thaiDate(from)} - {thaiDate(to)}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
            รับเข้า <b className="tabular-nums text-emerald-900" data-testid="total-in">{report.totalIn.toLocaleString('th-TH')}</b> รายการ
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
            เบิกออก <b className="tabular-nums text-amber-900" data-testid="total-out">{report.totalOut.toLocaleString('th-TH')}</b> รายการ
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
                  <th className="px-4 py-2 font-medium">วันที่</th>
                  <th className="px-4 py-2 font-medium">รายการ</th>
                  <th className="px-4 py-2 font-medium">Serial</th>
                  <th className="px-4 py-2 font-medium">สินค้า</th>
                  <th className="px-4 py-2 font-medium">ผู้ซื้อ / ลูกค้า</th>
                  <th className="px-4 py-2 font-medium">ผู้ทำรายการ</th>
                  <th className="px-4 py-2 font-medium">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.rows.map((r) => (
                  <tr key={r.id} data-testid="movement-row">
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">{thaiDateTime(r.at)}</td>
                    <td className="px-4 py-2">
                      <span className={`font-medium ${
                        r.type === 'IN' ? 'text-emerald-700' : r.type === 'OUT' ? 'text-amber-700' : 'text-slate-600'
                      }`}>
                        {SCAN_TYPE_LABEL[r.type] ?? r.type}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-slate-700">{r.serial}</td>
                    <td className="px-4 py-2">
                      <span className="text-slate-700">{r.productName}</span>
                      <span className="ml-1 text-xs text-slate-400">{r.sku}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{r.customerName ?? '-'}</td>
                    <td className="px-4 py-2 text-slate-600">{r.userName}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {r.note ?? (r.reason ? `(${r.reason})` : '-')}
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

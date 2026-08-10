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
      <div>
        <h1 className="text-xl font-semibold">รายงาน</h1>
        <p className="text-sm text-slate-500">
          กรองตามประเภทของ แบรนด์ ผู้ขาย หรือค้นหาชื่อ/SKU · ดูยอดคงเหลือหรือความเคลื่อนไหวตามช่วงวัน
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex gap-1" data-testid="report-tabs">
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
          <a href={exportHref('xlsx')} data-testid="export-xlsx" className="btn-ghost">
            โหลด Excel
          </a>
          <a href={exportHref('pdf')} data-testid="export-pdf" className="btn-ghost">
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
        active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
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
      <p className="text-sm text-slate-500">
        ณ {new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} · รวม{' '}
        <b className="text-slate-900" data-testid="grand-total">
          {grandTotalInStock.toLocaleString('th-TH')}
        </b>{' '}
        ชิ้น
      </p>

      {categories.length === 0 && (
        <p className="card p-6 text-sm text-slate-500" data-testid="stock-empty">
          ไม่พบสินค้าตามเงื่อนไขที่เลือก
        </p>
      )}

      {categories.map((c) => (
        <div key={c.categoryId} className="card overflow-hidden" data-testid="report-category">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="font-medium">
              {c.categoryName} <span className="text-slate-400">({c.categoryCode})</span>
            </h2>
            <span className="text-sm text-slate-600">
              คงเหลือรวม <b className="text-slate-900">{c.totalInStock}</b> ชิ้น
            </span>
          </div>
          {c.products.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">ยังไม่มีสินค้าในประเภทนี้</p>
          ) : (
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
                    <td className="px-4 py-2 font-mono">{p.sku}</td>
                    <td className="px-4 py-2">{p.name}</td>
                    <td className="px-4 py-2 text-slate-600">{p.brand ?? '-'}</td>
                    <td className="px-4 py-2 text-right font-medium">{p.inStock}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{p.out}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      <p className="text-sm text-slate-500">
        {thaiDate(from)} - {thaiDate(to)} · รับเข้า{' '}
        <b className="text-slate-900" data-testid="total-in">
          {report.totalIn.toLocaleString('th-TH')}
        </b>{' '}
        ชิ้น · เบิกออก{' '}
        <b className="text-slate-900" data-testid="total-out">
          {report.totalOut.toLocaleString('th-TH')}
        </b>{' '}
        ชิ้น
      </p>

      {report.rows.length === 0 ? (
        <p className="card p-6 text-sm text-slate-500" data-testid="movement-empty">
          ช่วงวันที่นี้ไม่มีการรับเข้าหรือเบิกออก
        </p>
      ) : (
        <div className="card overflow-hidden">
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
                  <td className="px-4 py-2 font-mono">{r.sku}</td>
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2 text-slate-600">{r.brand ?? '-'}</td>
                  <td className="px-4 py-2 text-slate-600">{r.categoryName}</td>
                  <td className="px-4 py-2 text-right font-medium text-emerald-700">
                    {r.inCount || '-'}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-amber-700">
                    {r.outCount || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

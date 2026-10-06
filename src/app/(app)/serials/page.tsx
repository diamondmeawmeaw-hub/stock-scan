import Link from 'next/link'
import {
  listScanLogs,
  listScanUsers,
  lookupSerial,
  searchSerials,
  type ScanLogPage,
  type SerialDetail,
} from '@/lib/scan-service'
import { dayRange } from '@/lib/date-range'
import { OUT_REASON_LABELS } from '@/lib/scan-rules'
import { ReturnButton } from '@/components/ReturnButton'
import { SerialSearchForm } from './SerialSearchForm'
import { ScanLogFilters } from './ScanLogFilters'

export const dynamic = 'force-dynamic'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function one(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key]
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

const thaiDateTime = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })

const TYPE_LABEL = { IN: 'รับเข้า', OUT: 'เบิกออก', AUDIT: 'ตรวจนับ' } as const

const SCAN_TYPES = ['IN', 'OUT', 'AUDIT'] as const
type ScanTypeCode = (typeof SCAN_TYPES)[number]

const isScanType = (value: string): value is ScanTypeCode =>
  SCAN_TYPES.includes(value as ScanTypeCode)

export default async function SerialsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const query = one(params, 'serial')

  const logQ = one(params, 'q')
  const rawType = one(params, 'type')
  const logType = isScanType(rawType) ? rawType : null
  const logUserId = one(params, 'user')
  const rawFrom = one(params, 'from')
  const rawTo = one(params, 'to')
  const from = DATE_PATTERN.test(rawFrom) ? rawFrom : ''
  const to = DATE_PATTERN.test(rawTo) ? rawTo : ''
  const pageNumber = Number(one(params, 'page')) || 1
  // เลือกมาข้างเดียวก็ยังกรองได้ ใส่ค่าเดียวกันอีกฝั่งเพื่อให้ได้ขอบวันแบบไทย
  const range = from || to ? dayRange(from || to, to || from) : null

  // ยิงเครื่องสแกนมาจะตรงเป๊ะเสมอ - ลองหาแบบเป๊ะก่อน ไม่เจอค่อยเสนอรายการที่ใกล้เคียง
  const [detail, logs, scanUsers] = await Promise.all([
    query ? lookupSerial(query) : null,
    listScanLogs({
      q: logQ,
      type: logType,
      userId: logUserId,
      from: range?.from,
      to: range?.to,
      page: pageNumber,
    }),
    listScanUsers(),
  ])
  const suggestions = detail && !detail.unit ? await searchSerials(query) : []

  const logFilters = { q: logQ, type: rawType, userId: logUserId, from, to }
  const pageHref = (page: number) => {
    const next = new URLSearchParams()
    if (query) next.set('serial', query)
    for (const [key, value] of Object.entries({
      q: logQ,
      type: logType ?? '',
      user: logUserId,
      from,
      to,
    })) {
      if (value) next.set(key, value)
    }
    if (page > 1) next.set('page', String(page))
    return `/serials?${next}#scan-logs`
  }

  return (
    <div className="space-y-5">
      <div className="scan-hero">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-200 text-sky-800 dark:bg-sky-900 dark:text-sky-200">
            <SearchIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-sky-950 dark:text-sky-100">ค้นหาตาม Serial</h1>
            <p className="mt-1 text-sm text-sky-900/70 dark:text-sky-200/70">
              ยิงหรือพิมพ์ serial เพื่อดูว่าของชิ้นนี้อยู่ที่ไหน รับเข้าวันไหน เบิกออกวันไหน และใครเป็นคนทำ
            </p>
          </div>
        </div>
      </div>

      <SerialSearchForm initial={query} />

      {detail && <SerialResult detail={detail} suggestions={suggestions} />}

      <ScanLogSection
        logs={logs}
        users={scanUsers}
        filters={logFilters}
        serial={query}
        pageHref={pageHref}
      />
    </div>
  )
}

function SerialResult({
  detail,
  suggestions,
}: {
  detail: SerialDetail
  suggestions: Awaited<ReturnType<typeof searchSerials>>
}) {
  const { unit, history } = detail

  if (!unit) {
    return (
      <div className="space-y-4">
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-800 dark:bg-amber-950"
          data-testid="serial-not-found"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300">
              <SearchXIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-100">
                ไม่พบ <span className="font-mono">{detail.serial}</span> ในคลัง
              </p>
              <p className="mt-1 text-sm text-amber-700/80 dark:text-amber-200/80">
                {history.length > 0
                  ? 'ไม่เคยรับเข้าระบบ แต่มีประวัติการยิงอยู่ด้านล่าง'
                  : 'ยังไม่เคยมีการยิง serial นี้เลย'}
              </p>
            </div>
          </div>
        </div>

        {/* ของนับจำนวน (ตู้แร็ค/สายแลน/รางไฟ) ไม่มี serial รายชิ้น ค้นตรงนี้ยังไงก็ไม่เจอ */}
        <div
          className="rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm dark:border-sky-800 dark:bg-sky-950"
          data-testid="quantity-hint"
        >
          <p className="text-sm text-sky-900 dark:text-sky-100">
            หาของนับจำนวนอยู่หรือเปล่า? ของแบบตู้แร็ค/สายแลนค้นด้วย serial ไม่เจอ
          </p>
          <Link
            href={`/reports?q=${encodeURIComponent(detail.serial)}`}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
          >
            ไปดูรายงานคงเหลือ
          </Link>
        </div>

        {suggestions.length > 0 && (
          <div
            className="overflow-hidden rounded-2xl border border-sky-100 bg-white dark:border-sky-900 dark:bg-slate-900 shadow-sm"
            data-testid="serial-suggestions"
          >
            <h2 className="border-b border-slate-100 dark:border-slate-800 px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
              serial ที่ใกล้เคียง
            </h2>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {suggestions.map((s) => (
                <li key={s.serial} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                  <Link
                    href={`/serials?serial=${encodeURIComponent(s.serial)}`}
                    className="font-mono font-medium text-sky-700 underline underline-offset-2 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
                  >
                    {s.serial}
                  </Link>
                  <span className="text-slate-600 dark:text-slate-300">
                    {s.productName} ({s.sku})
                  </span>
                  {s.vendorName && <span className="text-slate-400 dark:text-slate-500">{s.vendorName}</span>}
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {history.length > 0 && <HistoryTable history={history} />}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-100 bg-white dark:border-sky-900 dark:bg-slate-900 p-5 shadow-sm" data-testid="serial-detail">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100" data-testid="serial-value">
            {detail.serial}
          </span>
          <StatusBadge status={unit.status} />
        </div>
        <div className="mt-1 text-slate-600 dark:text-slate-300">
          {unit.productName} <span className="text-slate-400 dark:text-slate-500">({unit.sku})</span> ·{' '}
          {unit.categoryName}
          {unit.brand && <> · {unit.brand}</>}
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/70">
            <dt className="text-sm text-slate-500 dark:text-slate-400">ซื้อจาก</dt>
            <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200" data-testid="serial-vendor">
              {unit.vendorName ?? '-'}
            </dd>
          </div>
          <Field label="รับเข้าล่าสุด" value={unit.receivedAt} testId="serial-received-at" />
          <Field label="เบิกออกล่าสุด" value={unit.releasedAt} testId="serial-released-at" />
          <Field label="สแกนล่าสุด" value={unit.lastScanAt} testId="serial-last-scan-at" />
        </dl>
      </div>

      <HistoryTable history={history} />
    </div>
  )
}

function Field({
  label,
  value,
  testId,
}: {
  label: string
  value: string | null
  testId: string
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/70">
      <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200" data-testid={testId}>
        {value ? thaiDateTime(value) : '-'}
      </dd>
    </div>
  )
}

/** ป้ายผลการสแกน — ไม่ตัดคำแนวตั้ง อ่านง่ายกว่าตัวหนังสือสีล้วน */
function ResultBadge({
  result,
  accepted,
  message,
}: {
  result: string
  accepted: boolean
  message: string | null
}) {
  const tone =
    result === 'MISSING'
      ? 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200'
      : accepted
        ? 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'
        : 'border-rose-300 bg-rose-100 text-rose-950 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200'
  return (
    <span
      data-testid="result-badge"
      className={`result-badge inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-medium ${tone}`}
    >
      {message ?? result}
    </span>
  )
}

function StatusBadge({ status }: { status: 'IN_STOCK' | 'OUT' }) {
  return (
    <span
      data-testid="serial-status"
      data-status={status}
      className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${
        status === 'IN_STOCK'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
      }`}
    >
      {status === 'IN_STOCK' ? 'อยู่ในคลัง' : 'เบิกออกไปแล้ว'}
    </span>
  )
}

function HistoryTable({ history }: { history: SerialDetail['history'] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white dark:border-sky-900 dark:bg-slate-900 shadow-sm">
      <h2 className="border-b border-slate-100 dark:border-slate-800 px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
        ประวัติทั้งหมด ({history.length} รายการ)
      </h2>
      {history.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500" data-testid="serial-history-empty">
          ยังไม่มีประวัติการสแกน
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="serial-history">
            <thead className="bg-sky-50 text-left text-xs uppercase text-sky-900 dark:bg-sky-950 dark:text-sky-200">
              <tr>
                <th className="px-4 py-2 font-medium">เวลา</th>
                <th className="px-4 py-2 font-medium">ประเภท</th>
                <th className="px-4 py-2 font-medium">ผล</th>
                <th className="px-4 py-2 font-medium">ซื้อจาก</th>
                <th className="px-4 py-2 font-medium">ลูกค้า</th>
                <th className="px-4 py-2 font-medium">เหตุผล / หมายเหตุ</th>
                <th className="px-4 py-2 font-medium">ผู้สแกน</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {history.map((h) => (
                <tr key={h.id} data-testid="serial-history-row" className={h.accepted ? '' : 'bg-red-50/50 dark:bg-red-950/40'}>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500 dark:text-slate-400">{thaiDateTime(h.at)}</td>
                  <td className="px-4 py-2">
                    {TYPE_LABEL[h.type]}
                    {h.auditSessionName && (
                      <span className="text-slate-400 dark:text-slate-500"> · {h.auditSessionName}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <ResultBadge result={h.result} accepted={h.accepted} message={h.message} />
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{h.vendorName ?? '-'}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{h.customerName ?? '-'}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                    {[h.reason ? OUT_REASON_LABELS[h.reason] : null, h.note]
                      .filter(Boolean)
                      .join(' · ') || '-'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-300">{h.userName}</td>
                  <td className="px-4 py-2 text-right">
                    {h.type === 'OUT' && h.accepted && h.result === 'OK' && !h.reversed && (
                      <ReturnButton scanLogId={h.id} />
                    )}
                    {h.reversed && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">คืนแล้ว</span>
                    )}
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

function ScanLogSection({
  logs,
  users,
  filters,
  serial,
  pageHref,
}: {
  logs: ScanLogPage
  users: { id: string; displayName: string }[]
  filters: { q: string; type: string; userId: string; from: string; to: string }
  serial: string
  pageHref: (page: number) => string
}) {
  const first = (logs.page - 1) * logs.pageSize + 1
  const last = first + logs.rows.length - 1

  return (
    <div
      className="overflow-hidden rounded-2xl border border-sky-100 bg-white dark:border-sky-900 dark:bg-slate-900 shadow-sm scroll-mt-4"
      id="scan-logs"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 dark:border-slate-800 px-4 py-3">
        <h2 className="font-medium text-slate-900 dark:text-slate-100">ประวัติการสแกน</h2>
        <p className="text-sm text-slate-500" data-testid="scan-log-count">
          {logs.total === 0
            ? 'ไม่พบรายการ'
            : `แสดง ${first}-${last} จาก ${logs.total} รายการ`}
        </p>
      </div>

      <ScanLogFilters users={users} values={filters} serial={serial} />

      {logs.rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400" data-testid="scan-log-empty">
          ไม่มีรายการที่ตรงกับตัวกรอง
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="scan-log-table">
            <thead className="bg-sky-50 text-left text-xs uppercase text-sky-900 dark:bg-sky-950 dark:text-sky-200">
              <tr>
                <th className="px-4 py-2 font-medium">เวลา</th>
                <th className="px-4 py-2 font-medium">Serial</th>
                <th className="px-4 py-2 font-medium">ประเภท</th>
                <th className="px-4 py-2 font-medium">สินค้า</th>
                <th className="px-4 py-2 font-medium">ผล</th>
                <th className="px-4 py-2 font-medium">เหตุผล / หมายเหตุ</th>
                <th className="px-4 py-2 font-medium">ผู้สแกน</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.rows.map((row) => (
                <tr
                  key={row.id}
                  data-testid="scan-log-row"
                  className={row.accepted ? '' : 'bg-red-50/50 dark:bg-red-950/40'}
                >
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500 dark:text-slate-400">
                    {thaiDateTime(row.at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {row.serial ? (
                      <Link
                        href={`/serials?serial=${encodeURIComponent(row.serial)}`}
                        className="font-mono font-medium text-sky-700 underline underline-offset-2 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
                      >
                        {row.serial}
                      </Link>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">
                        {row.productName ?? '-'}
                        {row.quantity > 1 ? ` × ${row.quantity}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {TYPE_LABEL[row.type]}
                    {row.auditSessionName && (
                      <span className="text-slate-400 dark:text-slate-500"> · {row.auditSessionName}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-300">{row.productName ?? '-'}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <ResultBadge result={row.result} accepted={row.accepted} message={row.message} />
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                    {[row.reason ? OUT_REASON_LABELS[row.reason] : null, row.note]
                      .filter(Boolean)
                      .join(' · ') || '-'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-300">{row.userName}</td>
                  <td className="px-4 py-2 text-right">
                    {row.type === 'OUT' && row.accepted && row.result === 'OK' && !row.reversed && (
                      <ReturnButton scanLogId={row.id} />
                    )}
                    {row.reversed && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">คืนแล้ว</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logs.totalPages > 1 && (
        <div
          className="flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 px-4 py-3"
          data-testid="scan-log-pager"
        >
          <PagerLink
            href={pageHref(logs.page - 1)}
            disabled={logs.page <= 1}
            label="ก่อนหน้า"
            testId="scan-log-prev"
          />
          <span className="text-sm text-slate-500 dark:text-slate-400" data-testid="scan-log-page">
            หน้า {logs.page} / {logs.totalPages}
          </span>
          <PagerLink
            href={pageHref(logs.page + 1)}
            disabled={logs.page >= logs.totalPages}
            label="ถัดไป"
            testId="scan-log-next"
          />
        </div>
      )}
    </div>
  )
}

function PagerLink({
  href,
  disabled,
  label,
  testId,
}: {
  href: string
  disabled: boolean
  label: string
  testId: string
}) {
  if (disabled) {
    return (
      <span
        className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-slate-400 opacity-70 dark:border-sky-900 dark:bg-sky-950 dark:text-slate-500"
        data-testid={testId}
        aria-disabled
      >
        {label}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-sky-50 dark:border-sky-900 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      data-testid={testId}
    >
      {label}
    </Link>
  )
}

function SearchIcon({ className }: { className?: string }) {
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function SearchXIcon({ className }: { className?: string }) {
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
      <path d="m13.5 8.5-5 5" />
      <path d="m8.5 8.5 5 5" />
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

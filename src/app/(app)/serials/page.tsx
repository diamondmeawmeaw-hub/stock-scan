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
      <div>
        <h1 className="text-xl font-semibold">ค้นหาตาม Serial</h1>
        <p className="text-sm text-slate-500">
          ยิงหรือพิมพ์ serial เพื่อดูว่าของชิ้นนี้อยู่ที่ไหน รับเข้าวันไหน เบิกออกวันไหน และใครเป็นคนทำ
        </p>
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
        <div className="card p-6" data-testid="serial-not-found">
          <p className="font-medium">
            ไม่พบ <span className="font-mono">{detail.serial}</span> ในคลัง
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {history.length > 0
              ? 'ไม่เคยรับเข้าระบบ แต่มีประวัติการยิงอยู่ด้านล่าง'
              : 'ยังไม่เคยมีการยิง serial นี้เลย'}
          </p>
        </div>

        {suggestions.length > 0 && (
          <div className="card overflow-hidden" data-testid="serial-suggestions">
            <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-medium">
              serial ที่ใกล้เคียง
            </h2>
            <ul className="divide-y divide-slate-100">
              {suggestions.map((s) => (
                <li key={s.serial} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                  <Link
                    href={`/serials?serial=${encodeURIComponent(s.serial)}`}
                    className="font-mono font-medium underline underline-offset-2"
                  >
                    {s.serial}
                  </Link>
                  <span className="text-slate-600">
                    {s.productName} ({s.sku})
                  </span>
                  {s.vendorName && <span className="text-slate-400">{s.vendorName}</span>}
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
      <div className="card p-4" data-testid="serial-detail">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-2xl font-semibold" data-testid="serial-value">
            {detail.serial}
          </span>
          <StatusBadge status={unit.status} />
        </div>
        <div className="mt-1 text-slate-600">
          {unit.productName} <span className="text-slate-400">({unit.sku})</span> ·{' '}
          {unit.categoryName}
          {unit.brand && <> · {unit.brand}</>}
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-slate-500">รับเข้าจากผู้ขาย</dt>
            <dd className="mt-0.5 font-medium" data-testid="serial-vendor">
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
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium" data-testid={testId}>
        {value ? thaiDateTime(value) : '-'}
      </dd>
    </div>
  )
}

function StatusBadge({ status }: { status: 'IN_STOCK' | 'OUT' }) {
  return (
    <span
      data-testid="serial-status"
      data-status={status}
      className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${
        status === 'IN_STOCK' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {status === 'IN_STOCK' ? 'อยู่ในคลัง' : 'เบิกออกไปแล้ว'}
    </span>
  )
}

function HistoryTable({ history }: { history: SerialDetail['history'] }) {
  return (
    <div className="card overflow-hidden">
      <h2 className="border-b border-slate-200 px-4 py-3 font-medium">
        ประวัติทั้งหมด ({history.length} รายการ)
      </h2>
      {history.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500" data-testid="serial-history-empty">
          ยังไม่มีประวัติการสแกน
        </p>
      ) : (
        <table className="w-full text-sm" data-testid="serial-history">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">เวลา</th>
              <th className="px-4 py-2 font-medium">ประเภท</th>
              <th className="px-4 py-2 font-medium">ผล</th>
              <th className="px-4 py-2 font-medium">ผู้ขาย</th>
              <th className="px-4 py-2 font-medium">เหตุผล / หมายเหตุ</th>
              <th className="px-4 py-2 font-medium">ผู้สแกน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {history.map((h) => (
              <tr key={h.id} data-testid="serial-history-row" className={h.accepted ? '' : 'bg-red-50/50'}>
                <td className="whitespace-nowrap px-4 py-2 text-slate-500">{thaiDateTime(h.at)}</td>
                <td className="px-4 py-2">
                  {TYPE_LABEL[h.type]}
                  {h.auditSessionName && (
                    <span className="text-slate-400"> · {h.auditSessionName}</span>
                  )}
                </td>
                <td
                  className={`px-4 py-2 ${
                    h.result === 'MISSING'
                      ? 'text-amber-700'
                      : h.accepted
                        ? 'text-emerald-700'
                        : 'text-red-700'
                  }`}
                >
                  {h.message ?? h.result}
                </td>
                <td className="px-4 py-2 text-slate-600">{h.vendorName ?? '-'}</td>
                <td className="px-4 py-2 text-slate-600">
                  {[h.reason ? OUT_REASON_LABELS[h.reason] : null, h.note]
                    .filter(Boolean)
                    .join(' · ') || '-'}
                </td>
                <td className="px-4 py-2 text-slate-600">{h.userName}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
    <div className="card overflow-hidden scroll-mt-4" id="scan-logs">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="font-medium">ประวัติการสแกน</h2>
        <p className="text-sm text-slate-500" data-testid="scan-log-count">
          {logs.total === 0
            ? 'ไม่พบรายการ'
            : `แสดง ${first}-${last} จาก ${logs.total} รายการ`}
        </p>
      </div>

      <ScanLogFilters users={users} values={filters} serial={serial} />

      {logs.rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500" data-testid="scan-log-empty">
          ไม่มีรายการที่ตรงกับตัวกรอง
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="scan-log-table">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">เวลา</th>
                <th className="px-4 py-2 font-medium">Serial</th>
                <th className="px-4 py-2 font-medium">ประเภท</th>
                <th className="px-4 py-2 font-medium">สินค้า</th>
                <th className="px-4 py-2 font-medium">ผล</th>
                <th className="px-4 py-2 font-medium">เหตุผล / หมายเหตุ</th>
                <th className="px-4 py-2 font-medium">ผู้สแกน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.rows.map((row) => (
                <tr
                  key={row.id}
                  data-testid="scan-log-row"
                  className={row.accepted ? '' : 'bg-red-50/50'}
                >
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                    {thaiDateTime(row.at)}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/serials?serial=${encodeURIComponent(row.serial)}`}
                      className="font-mono font-medium underline underline-offset-2"
                    >
                      {row.serial}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {TYPE_LABEL[row.type]}
                    {row.auditSessionName && (
                      <span className="text-slate-400"> · {row.auditSessionName}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{row.productName ?? '-'}</td>
                  <td
                    className={`px-4 py-2 ${
                      row.result === 'MISSING'
                        ? 'text-amber-700'
                        : row.accepted
                          ? 'text-emerald-700'
                          : 'text-red-700'
                    }`}
                  >
                    {row.message ?? row.result}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {[row.reason ? OUT_REASON_LABELS[row.reason] : null, row.note]
                      .filter(Boolean)
                      .join(' · ') || '-'}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{row.userName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logs.totalPages > 1 && (
        <div
          className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3"
          data-testid="scan-log-pager"
        >
          <PagerLink
            href={pageHref(logs.page - 1)}
            disabled={logs.page <= 1}
            label="ก่อนหน้า"
            testId="scan-log-prev"
          />
          <span className="text-sm text-slate-500" data-testid="scan-log-page">
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
      <span className="btn-ghost cursor-not-allowed opacity-50" data-testid={testId} aria-disabled>
        {label}
      </span>
    )
  }
  return (
    <Link href={href} className="btn-ghost" data-testid={testId}>
      {label}
    </Link>
  )
}

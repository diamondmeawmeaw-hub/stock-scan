'use client'

import { useEffect, useState } from 'react'

type SerialDetail = {
  serial: string
  receivedAt: string | null
  releasedAt: string | null
  vendorName: string | null
  customerName: string | null
  history: {
    id: string
    type: string
    result: string
    reason: string | null
    at: string
    userName: string
  }[]
}

type SerialDetailResponse = {
  product: {
    id: string
    sku: string
    name: string
    brand: string | null
    categoryName: string
  } | null
  serials: SerialDetail[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

type Props = {
  productId: string
  filters: {
    categoryId: string
    brand: string
    vendorId: string
    q: string
    customerId: string
    timePeriod: string
  }
  serialMode?: 'IN_STOCK' | 'OUT'
}

export function SerialDetailPanel({ productId, filters, serialMode = 'IN_STOCK' }: Props) {
  const [data, setData] = useState<SerialDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const { categoryId, brand, vendorId, q, customerId, timePeriod } = filters

  // เปลี่ยนสินค้า/ตัวกรอง -> กลับไปหน้าแรก
  useEffect(() => {
    setPage(1)
  }, [productId, serialMode, categoryId, brand, vendorId, q, customerId, timePeriod])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      params.set('productId', productId)
      params.set('status', serialMode)
      params.set('page', String(page))
      if (categoryId) params.set('categoryId', categoryId)
      if (brand) params.set('brand', brand)
      if (vendorId) params.set('vendorId', vendorId)
      if (q) params.set('q', q)
      if (customerId) params.set('customerId', customerId)
      if (timePeriod && timePeriod !== 'all') {
        params.set('timePeriod', timePeriod)
      }

      try {
        const res = await fetch(`/api/reports/stock-serials?${params}`)
        if (!res.ok) throw new Error('Failed to load')
        const json: SerialDetailResponse = await res.json()
        if (!cancelled) {
          setData(json)
          // API clamp หน้าเกินช่วงให้อัตโนมัติ - sync state กลับด้วย
          if (json.page !== page) setPage(json.page)
        }
      } catch {
        if (!cancelled) setError('ไม่สามารถโหลดข้อมูล Serial ได้')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [
    productId,
    serialMode,
    categoryId,
    brand,
    vendorId,
    q,
    customerId,
    timePeriod,
    page,
  ])

  if (loading) {
    return (
      <div className="bg-slate-50 px-6 py-4 dark:bg-slate-800/60">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <LoadingSpinner />
          กำลังโหลดข้อมูล Serial...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 px-6 py-4 dark:bg-red-950/60">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    )
  }

  if (!data || data.total === 0) {
    return (
      <div className="bg-slate-50 px-6 py-4 dark:bg-slate-800/60">
        <p className="text-sm text-slate-500 dark:text-slate-400">ไม่พบ Serial</p>
      </div>
    )
  }

  const firstRow = (data.page - 1) * data.pageSize + 1
  const lastRow = Math.min(data.page * data.pageSize, data.total)

  return (
    <div className="bg-slate-50 px-4 py-4 sm:px-6 dark:bg-slate-800/60">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {data.product?.sku} · {data.product?.name}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          ({data.total.toLocaleString('th-TH')} Serial
          {data.totalPages > 1 ? ` · หน้า ${data.page}/${data.totalPages}` : ''})
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="table-cards w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2 font-medium">Serial</th>
              <th className="px-4 py-2 font-medium">ซื้อจาก</th>
              <th className="px-4 py-2 font-medium">วันที่รับเข้า</th>
              <th className="px-4 py-2 font-medium">วันที่เบิกออก</th>
              <th className="px-4 py-2 font-medium">ผู้ซื้อ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.serials.map((s) => (
              <tr key={s.serial} data-testid="serial-row">
                <td data-label="Serial" className="px-4 py-2 font-mono text-slate-700 dark:text-slate-200">{s.serial}</td>
                <td data-label="ซื้อจาก" className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-300">
                  {s.vendorName ?? 'ไม่ระบุ'}
                </td>
                <td data-label="วันที่รับเข้า" className="px-4 py-2 text-slate-600 dark:text-slate-300">
                  {s.receivedAt ? formatThaiDate(s.receivedAt) : '-'}
                </td>
                <td data-label="วันที่เบิกออก" className="px-4 py-2 text-slate-600 dark:text-slate-300">
                  {s.releasedAt ? formatThaiDate(s.releasedAt) : '-'}
                </td>
                <td data-label="ผู้ซื้อ" className="px-4 py-2 text-slate-600 dark:text-slate-300">
                  {s.customerName ?? '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.totalPages > 1 && (
        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"
          data-testid="serial-pagination"
        >
          <span className="text-slate-500 dark:text-slate-400">
            แสดง {firstRow.toLocaleString('th-TH')}-{lastRow.toLocaleString('th-TH')} จาก{' '}
            {data.total.toLocaleString('th-TH')}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(data.page - 1)}
              disabled={data.page <= 1}
              data-testid="serial-prev"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              onClick={() => setPage(data.page + 1)}
              disabled={data.page >= data.totalPages}
              data-testid="serial-next"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function LoadingSpinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-slate-400 dark:text-slate-500"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

function formatThaiDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

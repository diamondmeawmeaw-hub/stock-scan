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
}

export function SerialDetailPanel({ productId, filters }: Props) {
  const [data, setData] = useState<SerialDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      params.set('productId', productId)
      if (filters.categoryId) params.set('categoryId', filters.categoryId)
      if (filters.brand) params.set('brand', filters.brand)
      if (filters.vendorId) params.set('vendorId', filters.vendorId)
      if (filters.q) params.set('q', filters.q)
      if (filters.customerId) params.set('customerId', filters.customerId)
      if (filters.timePeriod && filters.timePeriod !== '30d') {
        params.set('timePeriod', filters.timePeriod)
      }

      try {
        const res = await fetch(`/api/reports/stock-serials?${params}`)
        if (!res.ok) throw new Error('Failed to load')
        const json: SerialDetailResponse = await res.json()
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setError('ไม่สามารถโหลดข้อมูล Serial ได้')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [productId, filters])

  if (loading) {
    return (
      <div className="bg-slate-50 px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <LoadingSpinner />
          กำลังโหลดข้อมูล Serial...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 px-6 py-4">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  if (!data || data.serials.length === 0) {
    return (
      <div className="bg-slate-50 px-6 py-4">
        <p className="text-sm text-slate-500">ไม่พบ Serial</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 px-6 py-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700">
          {data.product?.sku} · {data.product?.name}
        </span>
        <span className="text-xs text-slate-500">
          ({data.serials.length} Serial)
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Serial</th>
              <th className="px-4 py-2 font-medium">วันที่รับเข้า</th>
              <th className="px-4 py-2 font-medium">วันที่เบิกออก</th>
              <th className="px-4 py-2 font-medium">ผู้ซื้อ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.serials.map((s) => (
              <tr key={s.serial} data-testid="serial-row">
                <td className="px-4 py-2 font-mono text-slate-700">{s.serial}</td>
                <td className="px-4 py-2 text-slate-600">
                  {s.receivedAt ? formatThaiDate(s.receivedAt) : '-'}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {s.releasedAt ? formatThaiDate(s.releasedAt) : '-'}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {s.customerName ?? '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-slate-400"
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

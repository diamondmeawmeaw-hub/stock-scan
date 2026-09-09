'use client'

import { Fragment, useState } from 'react'
import type { StockReportRow } from '@/lib/scan-service'
import { SerialDetailPanel } from './SerialDetailPanel'

type StockViewProps = {
  categories: StockReportRow[]
  grandTotalInStock: number
  filters: {
    categoryId: string
    brand: string
    vendorId: string
    q: string
    customerId: string
    timePeriod: string
  }
  snapshotAt: string
  serialMode?: 'IN_STOCK' | 'OUT'
  summaryLabel?: string
}

function formatThaiDateTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
}

export function StockView({ categories, grandTotalInStock, filters, snapshotAt, serialMode, summaryLabel }: StockViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-sm">
        <span className="text-sm text-slate-500">
          ณ {formatThaiDateTime(snapshotAt)}
        </span>
        <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800">
          {summaryLabel ?? 'รวม'}
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
        <CategorySection key={c.categoryId} category={c} filters={filters} serialMode={serialMode} />
      ))}
    </div>
  )
}

function CategorySection({
  category,
  filters,
  serialMode,
}: {
  category: StockReportRow
  filters: StockViewProps['filters']
  serialMode?: 'IN_STOCK' | 'OUT'
}) {
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())
  const isOut = serialMode === 'OUT'

  function toggleExpand(productId: string) {
    setExpandedProducts((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      return next
    })
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm"
      data-testid="report-category"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="font-medium text-slate-900">
          {category.categoryName} <span className="text-slate-400">({category.categoryCode})</span>
        </h2>
        <span className="text-sm text-slate-600">
          {isOut ? 'เบิกออกรวม' : 'คงเหลือรวม'}{' '}
          <b className="text-slate-900">{isOut ? category.totalInStock : category.totalInStock}</b> ชิ้น
        </span>
      </div>
      {category.products.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">ยังไม่มีสินค้าในประเภทนี้</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">SKU</th>
                <th className="px-4 py-2 font-medium">สินค้า</th>
                <th className="px-4 py-2 font-medium">แบรนด์</th>
                {isOut ? (
                  <th className="px-4 py-2 text-right font-medium">เบิกออก</th>
                ) : (
                  <>
                    <th className="px-4 py-2 text-right font-medium">คงเหลือ</th>
                    <th className="px-4 py-2 text-right font-medium">เบิกออกไปแล้ว</th>
                  </>
                )}
                <th className="px-4 py-2 text-center font-medium">Serial</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {category.products.map((p) => {
                const isExpanded = expandedProducts.has(p.productId)
                return (
                  <Fragment key={p.productId}>
                    <tr>
                      <td className="px-4 py-2 font-mono text-slate-700">{p.sku}</td>
                      <td className="px-4 py-2">{p.name}</td>
                      <td className="px-4 py-2 text-slate-600">{p.brand ?? '-'}</td>
                      {isOut ? (
                        <td className="px-4 py-2 text-right font-medium tabular-nums text-amber-700">
                          {p.out}
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-2 text-right font-medium tabular-nums">
                            {p.inStock}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-500">{p.out}</td>
                        </>
                      )}
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => toggleExpand(p.productId)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-600 transition hover:bg-sky-50 hover:text-sky-700"
                          data-testid={`expand-${p.sku}`}
                        >
                          <ChevronIcon expanded={isExpanded} />
                          {isExpanded ? 'ซ่อน Serial' : 'ดู Serial'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={isOut ? 5 : 6} className="p-0">
                          <SerialDetailPanel
                            productId={p.productId}
                            filters={filters}
                            serialMode={serialMode}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

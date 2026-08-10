'use client'

import { useCallback, useMemo, useState } from 'react'
import { ScanConsole, type ScanOutcomeLike } from '@/components/ScanConsole'
import { api } from '@/lib/client'

type ProductOption = {
  id: string
  sku: string
  name: string
  categoryName: string
  inStock: number
}

type VendorOption = { id: string; code: string; name: string }

export function ScanInClient({
  products,
  vendors,
}: {
  products: ProductOption[]
  vendors: VendorOption[]
}) {
  const [productId, setProductId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [note, setNote] = useState('')

  const grouped = useMemo(() => {
    const map = new Map<string, ProductOption[]>()
    for (const p of products) {
      const list = map.get(p.categoryName) ?? []
      list.push(p)
      map.set(p.categoryName, list)
    }
    return [...map.entries()]
  }, [products])

  const selected = products.find((p) => p.id === productId) ?? null

  const onScan = useCallback(
    async (serial: string): Promise<ScanOutcomeLike> =>
      api<ScanOutcomeLike>('/api/scan/in', {
        method: 'POST',
        body: JSON.stringify({ serial, productId, vendorId: vendorId || null, note: note || null }),
      }),
    [productId, vendorId, note]
  )

  return (
    <div className="space-y-4">
      <div className="card grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="product">
            สินค้าที่กำลังรับเข้า
          </label>
          <select
            id="product"
            data-testid="product-select"
            className="field"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">— เลือกสินค้า —</option>
            {grouped.map(([categoryName, list]) => (
              <optgroup key={categoryName} label={categoryName}>
                {list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selected && (
            <p className="mt-1 text-xs text-slate-500">
              ตอนนี้ในคลังมี {selected.inStock} ชิ้น
            </p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="vendor">
            ผู้ขาย (ไม่ระบุก็ได้)
          </label>
          <select
            id="vendor"
            data-testid="vendor-select"
            className="field"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            <option value="">— ไม่ระบุผู้ขาย —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code} · {v.name}
              </option>
            ))}
          </select>
          {vendors.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">
              ยังไม่มีผู้ขายในระบบ - เพิ่มได้ที่หน้า &ldquo;ผู้ขาย&rdquo;
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="note">
            หมายเหตุ (ติดไปกับทุกรายการที่ยิงในรอบนี้)
          </label>
          <input
            id="note"
            className="field"
            placeholder="เช่น เลขที่ใบส่งของ"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      <ScanConsole
        onScan={onScan}
        disabled={!productId}
        disabledHint="เลือกสินค้าก่อนถึงจะยิงได้"
        label={selected ? `ยิง serial ของ ${selected.name}` : 'ยิงบาร์โค้ด / serial'}
      />
    </div>
  )
}

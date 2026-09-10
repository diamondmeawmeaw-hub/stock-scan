'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScanConsole, type FeedItem, type ScanOutcomeLike } from '@/components/ScanConsole'
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
  // สรุปของค้าง confirm ไว้เตือนตอนเปลี่ยนสินค้า (มาจาก feed ใน ScanConsole)
  const [pendingInfo, setPendingInfo] = useState<{
    count: number
    productIds: string[]
    productNames: string[]
  }>({ count: 0, productIds: [], productNames: [] })

  /**
   * ค่าฟอร์มล่าสุดแบบ ref - onScan ถูกเรียกตอน drain คิว ซึ่ง closure อาจเก่ากว่าค่าบนจอ
   * (ยิงเบิ้ลรัวๆ แล้วเปลี่ยนสินค้ากลางคัน) อ่านจาก ref ที่สดเสมอ ของแต่ละชิ้นจึงผูกถูกตัว
   */
  const formRef = useRef({ productId: '', vendorId: '', note: '' })
  const productsRef = useRef(products)
  useEffect(() => {
    formRef.current = { productId, vendorId, note }
  })
  useEffect(() => {
    productsRef.current = products
  })

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

  const onScan = useCallback(async (serial: string): Promise<ScanOutcomeLike> => {
    // snapshot ค่าตอนยิงของชิ้นนี้ - ต่อให้เปลี่ยนฟอร์มก่อนกดยืนยัน ของชิ้นนี้ก็ยังผูกค่าเดิม
    const snap = formRef.current
    const prod = productsRef.current.find((p) => p.id === snap.productId) ?? null
    return {
      accepted: true,
      result: 'PENDING',
      message: 'รอยืนยันการบันทึก',
      serial,
      product: prod,
      productId: snap.productId || null,
      vendorId: snap.vendorId || null,
      note: snap.note || null,
    }
  }, [])

  const onConfirm = useCallback(
    async (items: FeedItem[]) => {
      const outcomes: ScanOutcomeLike[] = []
      for (const item of items) {
        // ใช้ค่าที่ snapshot ไว้ตอนยิงของชิ้นนั้น ไม่ใช่ค่าปัจจุบันบนฟอร์ม
        const pid = item.productId || formRef.current.productId
        if (!pid) {
          outcomes.push({
            accepted: false,
            result: 'ERROR',
            message: 'ไม่ได้เลือกสินค้าตอนยิงชิ้นนี้',
            serial: item.serial,
          })
          continue
        }
        try {
          outcomes.push(await api<ScanOutcomeLike>('/api/scan/in', {
            method: 'POST',
            body: JSON.stringify({
              serial: item.serial,
              productId: pid,
              vendorId: item.vendorId ?? null,
              note: item.note ?? null,
            }),
          }))
        } catch (error) {
          outcomes.push({
            accepted: false,
            result: 'ERROR',
            message: error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ',
            serial: item.serial,
          })
        }
      }
      return outcomes
    },
    []
  )

  const onDelete = useCallback(
    async (item: ScanOutcomeLike) => {
      if (!item.scanLogId) return
      await api('/api/scan/undo', {
        method: 'POST',
        body: JSON.stringify({ scanLogId: item.scanLogId }),
      })
    },
    []
  )

  const handleFeedChange = useCallback((items: FeedItem[]) => {
    setPendingInfo({
      count: items.length,
      productIds: [...new Set(items.map((i) => i.productId).filter((id): id is string => !!id))],
      productNames: [...new Set(items.map((i) => i.product?.name ?? '(ไม่ระบุสินค้า)'))],
    })
  }, [])

  // เปลี่ยนสินค้าทั้งที่มีของค้าง = ของใหม่จะไปอีกสินค้า ถามก่อนกันเผลอ
  function handleProductChange(next: string) {
    if (
      next !== productId &&
      pendingInfo.count > 0 &&
      !pendingInfo.productIds.every((id) => id === next)
    ) {
      const ok = window.confirm(
        `มี ${pendingInfo.count} รายการรอ confirm อยู่ (สินค้า: ${pendingInfo.productNames.join(', ') || '-'}) — ` +
          'เปลี่ยนสินค้าแล้วชิ้นที่ยิงต่อจากนี้จะผูกกับสินค้าใหม่ ส่วนของเก่ายังผูกสินค้าเดิม ดำเนินการต่อ?'
      )
      if (!ok) return
    }
    setProductId(next)
  }

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
            onChange={(e) => handleProductChange(e.target.value)}
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
            ซื้อจาก (ไม่ระบุก็ได้)
          </label>
          <select
            id="vendor"
            data-testid="vendor-select"
            className="field"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            <option value="">— ไม่ระบุผู้จำหน่าย —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code} · {v.name}
              </option>
            ))}
          </select>
          {vendors.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">
              ยังไม่มีผู้จำหน่ายในระบบ - เพิ่มได้ที่หน้า &ldquo;ซื้อจาก&rdquo;
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

      {pendingInfo.count > 0 && (
        <div
          data-testid="pending-notice"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          มี {pendingInfo.count} รายการรอ confirm (สินค้า: {pendingInfo.productNames.join(', ') || '-'})
          — ค่าในฟอร์มตอนนี้มีผลเฉพาะชิ้นที่ยิงหลังจากนี้
        </div>
      )}

      <ScanConsole
        onScan={onScan}
        onDelete={onDelete}
        onConfirm={onConfirm}
        onFeedChange={handleFeedChange}
        disabled={!productId}
        disabledHint="เลือกสินค้าก่อนถึงจะยิงได้"
        label={selected ? `ยิง serial ของ ${selected.name}` : 'ยิงบาร์โค้ด / serial'}
        rejectDuplicateInFeed
      />
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScanConsole, type FeedItem, type ScanOutcomeLike } from '@/components/ScanConsole'
import { ProductPicker } from '@/components/ProductPicker'
import { UNIT_CUSTOM, UNIT_LABELS } from '@/lib/units'
import { api } from '@/lib/client'

type ProductOption = {
  id: string
  sku: string
  name: string
  categoryName: string
  trackingType: 'SERIAL' | 'QUANTITY'
  unitLabel: string | null
  inStock: number
  /** มีของ/ยอด/ประวัติแล้ว = วิธีนับล็อก เปลี่ยนไม่ได้ */
  hasHistory: boolean
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
  // ฟอร์มกรอกจำนวนสำหรับสินค้าแบบ QUANTITY
  const [qty, setQty] = useState('')
  const [qtyBusy, setQtyBusy] = useState(false)
  const [qtyMessage, setQtyMessage] = useState<{ ok: boolean; text: string } | null>(null)
  // วิธีรับของสินค้าที่ยังไม่มีประวัติ - สลับได้อิสระจนกว่าจะบันทึกสำเร็จครั้งแรก
  const [receiveMode, setReceiveMode] = useState<'SERIAL' | 'QUANTITY'>('SERIAL')
  const [receiveUnit, setReceiveUnit] = useState('ชิ้น')
  const [receiveCustomUnit, setReceiveCustomUnit] = useState(false)
  const router = useRouter()
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

  const selected = products.find((p) => p.id === productId) ?? null
  // สินค้ามีประวัติแล้วใช้วิธีเดิมของมัน - ยังไม่มีให้เลือกวิธีรับเอง
  const unlocked = !!selected && !selected.hasHistory
  const effectiveTracking = !selected ? 'SERIAL' : unlocked ? receiveMode : selected.trackingType

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
      // รับสำเร็จ = สินค้าอาจล็อกวิธีนับแล้ว โหลดข้อมูลใหม่ให้ tabs หาย/คงตามจริง
      if (outcomes.some((o) => o.accepted)) router.refresh()
      return outcomes
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // กันเผลอเปลี่ยนหน้า/ปิดแท็บทั้งที่ยังมีของรอ confirm (ของจะไม่เข้าคลัง)
  useEffect(() => {
    if (pendingInfo.count === 0) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pendingInfo.count])

  // เปลี่ยนสินค้าทั้งที่มีของค้าง = ของใหม่จะไปอีกสินค้า ถามก่อนกันเผลอ
  function handleProductChange(next: string) {
    if (next === productId) return
    const nextProduct = products.find((p) => p.id === next) ?? null
    // สลับข้ามชนิด (รายชิ้น <-> นับจำนวน) จะถอด ScanConsole ทิ้ง ของที่ยิงค้างไว้หายหมด
    // แถมแถบเหลืองกับ beforeunload จะค้างหลอก - บล็อกไว้ก่อน ให้ยืนยัน/ลบของค้างให้เสร็จก่อน
    // (เทียบวิธีรับจริงที่กำลังใช้ ไม่ใช่ค่าที่เก็บใน DB - ของใหม่ไร้ประวัติวิธีใน DB ยังเป็น SERIAL)
    if (pendingInfo.count > 0 && effectiveTracking !== (nextProduct?.trackingType ?? 'SERIAL')) {
      window.alert(
        `ยังมี ${pendingInfo.count} รายการรอ confirm อยู่ - กดยืนยันบันทึกหรือลบออกก่อน แล้วค่อยเปลี่ยนชนิดสินค้า (ไม่งั้นของที่ยิงค้างไว้จะหาย)`
      )
      return
    }
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
    setQty('')
    setQtyMessage(null)
    setReceiveMode('SERIAL')
    setReceiveUnit('ชิ้น')
    setReceiveCustomUnit(false)
  }

  // สลับวิธีรับทั้งที่มีของค้างในคิว = ของในคิวผูกวิธีเดิม ของใหม่ผูกวิธีใหม่ กันงงให้เคลียร์ก่อน
  function handleReceiveModeChange(next: 'SERIAL' | 'QUANTITY') {
    if (next === receiveMode) return
    if (pendingInfo.count > 0) {
      window.alert(
        `ยังมี ${pendingInfo.count} รายการรอ confirm อยู่ - กดยืนยันบันทึกหรือลบออกก่อน แล้วค่อยสลับวิธีรับ (ไม่งั้นของที่ยิงค้างไว้จะหาย)`
      )
      return
    }
    setReceiveMode(next)
    setQtyMessage(null)
  }

  const isQuantity = effectiveTracking === 'QUANTITY' && !!selected

  async function submitQuantity(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || qtyBusy) return
    const amount = Number(qty)
    // เช็คจำนวนก่อน PATCH - กัน PATCH ผ่านแล้ว POST ล้มทิ้ง dead-end ไว้
    if (!Number.isInteger(amount) || amount < 1 || amount > 999999) {
      setQtyMessage({ ok: false, text: 'จำนวนต้องเป็นจำนวนเต็ม 1–999999' })
      return
    }
    if (unlocked && receiveCustomUnit && !receiveUnit.trim()) {
      setQtyMessage({ ok: false, text: 'พิมพ์หน่วยนับเอง (1–20 ตัวอักษร) หรือเลือกจากรายการ' })
      return
    }
    setQtyBusy(true)
    setQtyMessage(null)
    try {
      // สินค้ายังไม่มีประวัติ + เลือกรับแบบจำนวนครั้งแรก = ล็อกวิธีนับก่อนรับของ
      // (PATCH ล้ม = หยุดเลย ไม่รับของ วิธีนับยังไม่ล็อก)
      let patched = false
      if (unlocked && selected.trackingType !== 'QUANTITY') {
        const unit = receiveCustomUnit ? receiveUnit.trim() || 'ชิ้น' : receiveUnit
        await api(`/api/products/${selected.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ trackingType: 'QUANTITY', unitLabel: unit }),
        })
        patched = true
      }
      try {
        const res = await api<{
          message: string
          productInStock: number
          quantity: number
        }>('/api/quantity/in', {
          method: 'POST',
          body: JSON.stringify({
            productId: selected.id,
            quantity: amount,
            vendorId: vendorId || null,
            note: note || null,
          }),
        })
        setQtyMessage({ ok: true, text: res.message })
        setQty('')
      } catch (error) {
        // PATCH ผ่านแต่รับของล้ม = ล็อกไปแล้ว ต้องโหลดสถานะจริงมาโชว์ กันค้างหน้าเก่า
        if (patched) router.refresh()
        throw error
      }
      router.refresh()
    } catch (error) {
      setQtyMessage({
        ok: false,
        text: error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ',
      })
    } finally {
      setQtyBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card-pop grid gap-4 p-4 sm:p-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="product-select">
            สินค้าที่กำลังรับเข้า
          </label>
          <ProductPicker
            options={products.map((p) => ({
              id: p.id,
              sku: p.sku,
              name: p.name,
              categoryName: p.categoryName,
              stockText: `เหลือ ${p.inStock} ${p.trackingType === 'QUANTITY' ? (p.unitLabel ?? 'ชิ้น') : 'ชิ้น'}`,
            }))}
            value={productId}
            onChange={handleProductChange}
          />
          {selected && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {unlocked ? (
                <>สินค้าใหม่ (ยังไม่มีประวัติ) - เลือกวิธีรับข้างล่าง สลับได้จนกว่าจะบันทึกสำเร็จครั้งแรก</>
              ) : (
                <>
                  ตอนนี้ในคลังมี {selected.inStock} {selected.trackingType === 'QUANTITY' ? (selected.unitLabel ?? 'ชิ้น') : 'ชิ้น'}
                  {selected.trackingType === 'QUANTITY' ? ' (สินค้านับจำนวน)' : ''}
                </>
              )}
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
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              ยังไม่มีผู้จำหน่ายในระบบ - เพิ่มได้ที่หน้า &ldquo;ซื้อจาก&rdquo;
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="note">
            หมายเหตุ + ตำแหน่งเก็บของ (ติดไปกับทุกรายการที่ยิงในรอบนี้)
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

      {selected && unlocked && (
        <div className="flex gap-2" role="tablist" aria-label="วิธีรับของ" data-testid="receive-mode">
          <button
            type="button"
            role="tab"
            aria-selected={receiveMode === 'SERIAL'}
            data-testid="receive-mode-serial"
            onClick={() => handleReceiveModeChange('SERIAL')}
            className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${
              receiveMode === 'SERIAL' ? 'border-sky-400 bg-sky-300 text-sky-950 dark:border-sky-600 dark:bg-sky-800 dark:text-sky-100' : 'border-sky-200 bg-white text-slate-600 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            ยิง serial (รายชิ้น)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={receiveMode === 'QUANTITY'}
            data-testid="receive-mode-quantity"
            onClick={() => handleReceiveModeChange('QUANTITY')}
            className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${
              receiveMode === 'QUANTITY' ? 'border-sky-400 bg-sky-300 text-sky-950 dark:border-sky-600 dark:bg-sky-800 dark:text-sky-100' : 'border-sky-200 bg-white text-slate-600 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            กรอกจำนวน
          </button>
        </div>
      )}

      {pendingInfo.count > 0 && (
        <div
          data-testid="pending-notice"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          มี {pendingInfo.count} รายการรอ confirm (สินค้า: {pendingInfo.productNames.join(', ') || '-'})
          — ค่าในฟอร์มตอนนี้มีผลเฉพาะชิ้นที่ยิงหลังจากนี้
        </div>
      )}

      {isQuantity && selected ? (
        <form onSubmit={submitQuantity} className="card-pop space-y-3 p-4 sm:p-5" data-testid="quantity-in-form">
          {unlocked && (
            <div>
              <label className="label" htmlFor="receive-unit">
                หน่วยนับ (ล็อกพร้อมวิธีนับตอนบันทึกครั้งแรก)
              </label>
              <div className="flex gap-2">
                <select
                  id="receive-unit"
                  data-testid="receive-unit"
                  className="field"
                  value={receiveCustomUnit ? UNIT_CUSTOM : receiveUnit}
                  onChange={(e) => {
                    if (e.target.value === UNIT_CUSTOM) {
                      setReceiveCustomUnit(true)
                      setReceiveUnit('')
                    } else {
                      setReceiveCustomUnit(false)
                      setReceiveUnit(e.target.value)
                    }
                  }}
                >
                  {UNIT_LABELS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                  <option value={UNIT_CUSTOM}>อื่นๆ (พิมพ์เอง)</option>
                </select>
                {receiveCustomUnit && (
                  <input
                    data-testid="receive-unit-custom"
                    className="field"
                    placeholder="เช่น ลัง (1–20 ตัวอักษร)"
                    maxLength={20}
                    value={receiveUnit}
                    onChange={(e) => setReceiveUnit(e.target.value)}
                  />
                )}
              </div>
            </div>
          )}
          <div>
            <label className="label" htmlFor="qty">
              จำนวนที่รับเข้า ({unlocked ? (receiveCustomUnit ? receiveUnit.trim() || 'ชิ้น' : receiveUnit) : (selected.unitLabel ?? 'ชิ้น')})
            </label>
            <div className="flex gap-2">
              <input
                id="qty"
                data-testid="quantity-input"
                className="field"
                inputMode="numeric"
                type="number"
                min={1}
                max={999999}
                step={1}
                required
                placeholder="เช่น 10"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              <button className="btn-pop shrink-0" disabled={qtyBusy}>
                {qtyBusy ? 'กำลังบันทึก…' : 'รับเข้า'}
              </button>
            </div>
          </div>
          {qtyMessage && (
            <p
              data-testid="quantity-message"
              className={`rounded-xl border-2 px-3 py-2 text-sm font-medium ${qtyMessage.ok ? 'border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200' : 'border-rose-300 bg-rose-100 text-rose-950 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200'}`}
            >
              {qtyMessage.text}
            </p>
          )}
        </form>
      ) : (
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
      )}
    </div>
  )
}

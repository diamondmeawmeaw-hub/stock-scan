'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScanConsole, type ScanOutcomeLike } from '@/components/ScanConsole'
import { OUT_REASONS, api } from '@/lib/client'

type CustomerOption = { id: string; code: string; name: string }

type QuantityProductOption = {
  id: string
  sku: string
  name: string
  categoryName: string
  unitLabel: string | null
  inStock: number
}

export function ScanOutClient({
  customers,
  quantityProducts,
}: {
  customers: CustomerOption[]
  quantityProducts: QuantityProductOption[]
}) {
  const [mode, setMode] = useState<'SERIAL' | 'QUANTITY'>('SERIAL')
  const [reason, setReason] = useState<string>('SALE')
  const [customerId, setCustomerId] = useState('')
  const [note, setNote] = useState('')
  const router = useRouter()

  // ── ฟอร์มเบิกออกแบบจำนวน ──
  const [qtyProductId, setQtyProductId] = useState('')
  const [qty, setQty] = useState('')
  const [qtyBusy, setQtyBusy] = useState(false)
  const [qtyMessage, setQtyMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const groupedQty = useMemo(() => {
    const map = new Map<string, QuantityProductOption[]>()
    for (const p of quantityProducts) {
      const list = map.get(p.categoryName) ?? []
      list.push(p)
      map.set(p.categoryName, list)
    }
    return [...map.entries()]
  }, [quantityProducts])

  const selectedQty = quantityProducts.find((p) => p.id === qtyProductId) ?? null
  const maxQty = selectedQty?.inStock ?? 0

  const onScan = useCallback(
    async (serial: string): Promise<ScanOutcomeLike> =>
      api<ScanOutcomeLike>('/api/scan/out', {
        method: 'POST',
        body: JSON.stringify({ serial, reason, customerId: customerId || null, note: note || null }),
      }),
    [reason, customerId, note]
  )

  async function submitQuantity(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedQty || qtyBusy) return
    setQtyBusy(true)
    setQtyMessage(null)
    try {
      const res = await api<{ message: string; productInStock: number; quantity: number }>(
        '/api/quantity/out',
        {
          method: 'POST',
          body: JSON.stringify({
            productId: selectedQty.id,
            quantity: Number(qty),
            reason,
            customerId: customerId || null,
            note: note || null,
          }),
        }
      )
      setQtyMessage({ ok: true, text: res.message })
      setQty('')
      // ของหมดแล้วให้หลุดจากตัวเลือก กันกดเบิกซ้ำเกินยอด
      if (res.productInStock <= 0) setQtyProductId('')
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
      <div className="flex gap-2" role="tablist" aria-label="วิธีเบิกออก">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'SERIAL'}
          data-testid="mode-serial"
          onClick={() => setMode('SERIAL')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            mode === 'SERIAL' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
          }`}
        >
          ยิง serial (รายชิ้น)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'QUANTITY'}
          data-testid="mode-quantity"
          onClick={() => setMode('QUANTITY')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            mode === 'QUANTITY' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
          }`}
        >
          กรอกจำนวน
        </button>
      </div>

      <div className="card grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="customer">ขายให้ลูกค้า</label>
          <select
            id="customer"
            data-testid="customer-select"
            className="field"
            value={customerId}
            disabled={reason !== 'SALE'}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">— เลือกลูกค้า —</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.code} · {customer.name}</option>
            ))}
          </select>
          {customers.length === 0 && <p className="mt-1 text-xs text-slate-500">เพิ่มลูกค้าได้ที่เมนูจัดการข้อมูล</p>}
        </div>
        <div>
          <label className="label" htmlFor="reason">
            เหตุผลที่เบิกออก
          </label>
          <select
            id="reason"
            data-testid="reason-select"
            className="field"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {OUT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="note">
            หมายเหตุ (ติดไปกับทุกรายการที่ยิงในรอบนี้)
          </label>
          <input
            id="note"
            className="field"
            placeholder="เช่น ใช้งานในโครงการ ABC Site"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      {mode === 'SERIAL' ? (
        <ScanConsole
          onScan={onScan}
          label="ยิง serial ที่จะเบิกออก"
        />
      ) : (
        <form onSubmit={submitQuantity} className="card space-y-3 p-4" data-testid="quantity-out-form">
          <div>
            <label className="label" htmlFor="qty-product">
              สินค้าที่จะเบิกออก
            </label>
            <select
              id="qty-product"
              data-testid="quantity-product-select"
              className="field"
              value={qtyProductId}
              onChange={(e) => {
                setQtyProductId(e.target.value)
                setQtyMessage(null)
              }}
            >
              <option value="">— เลือกสินค้า —</option>
              {groupedQty.map(([categoryName, list]) => (
                <optgroup key={categoryName} label={categoryName}>
                  {list.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.inStock <= 0}>
                      {p.sku} · {p.name} (เหลือ {p.inStock} {p.unitLabel ?? 'ชิ้น'})
                      {p.inStock <= 0 ? ' — หมด' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {quantityProducts.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">
                ยังไม่มีสินค้าแบบนับจำนวน — สร้างได้ที่หน้าสินค้า
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="qty">
              จำนวนที่จะเบิกออก{selectedQty ? ` (มี ${maxQty} ${selectedQty.unitLabel ?? 'ชิ้น'})` : ''}
            </label>
            <div className="flex gap-2">
              <input
                id="qty"
                data-testid="quantity-input"
                className="field"
                inputMode="numeric"
                type="number"
                min={1}
                max={maxQty > 0 ? maxQty : undefined}
                step={1}
                required
                disabled={!selectedQty || maxQty <= 0}
                placeholder={selectedQty ? `ไม่เกิน ${maxQty}` : 'เลือกสินค้าก่อน'}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              <button
                className="btn-primary shrink-0"
                disabled={qtyBusy || !selectedQty || maxQty <= 0}
              >
                {qtyBusy ? 'กำลังบันทึก…' : 'เบิกออก'}
              </button>
            </div>
          </div>
          {qtyMessage && (
            <p
              data-testid="quantity-message"
              className={`rounded-lg px-3 py-2 text-sm ${qtyMessage.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
            >
              {qtyMessage.text}
            </p>
          )}
        </form>
      )}
    </div>
  )
}

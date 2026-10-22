'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScanConsole, type FeedItem, type ScanOutcomeLike } from '@/components/ScanConsole'
import { ProductPicker } from '@/components/ProductPicker'
import { OUT_REASONS, api } from '@/lib/client'

type CustomerOption = { id: string; code: string; name: string }

type ProjectOption = { id: string; customerId: string; name: string }

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
  projects: initialProjects,
  quantityProducts,
}: {
  customers: CustomerOption[]
  projects: ProjectOption[]
  quantityProducts: QuantityProductOption[]
}) {
  const [mode, setMode] = useState<'SERIAL' | 'QUANTITY'>('SERIAL')
  const [reason, setReason] = useState<string>('SALE')
  const [customerId, setCustomerId] = useState('')
  const [note, setNote] = useState('')
  const router = useRouter()

  // ── โปรเจคของลูกค้า (ผูกกับรายการขาย) ──
  const [projects, setProjects] = useState<ProjectOption[]>(initialProjects)
  const [projectId, setProjectId] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [projectError, setProjectError] = useState('')

  // เปลี่ยนลูกค้า -> โปรเจคของลูกค้าคนก่อนใช้ไม่ได้แล้ว ล้างทิ้งกันของผูกผิดคน
  useEffect(() => {
    setProjectId('')
    setNewProjectName('')
    setProjectError('')
  }, [customerId])

  const customerProjects = projects.filter((p) => p.customerId === customerId)
  const showProject = reason === 'SALE' && customerId !== ''

  async function createProject() {
    const name = newProjectName.trim()
    if (!name || !customerId || creatingProject) return
    setCreatingProject(true)
    setProjectError('')
    try {
      const { project } = await api<{ project: ProjectOption }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ customerId, name }),
      })
      setProjects((prev) => [...prev, project])
      setProjectId(project.id)
      setNewProjectName('')
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : 'สร้างโปรเจคไม่สำเร็จ')
    } finally {
      setCreatingProject(false)
    }
  }

  // ── ฟอร์มเบิกออกแบบจำนวน ──
  const [qtyProductId, setQtyProductId] = useState('')
  const [qty, setQty] = useState('')
  const [qtyBusy, setQtyBusy] = useState(false)
  const [qtyMessage, setQtyMessage] = useState<{ ok: boolean; text: string } | null>(null)
  // จำนวนของค้าง confirm - เตือนตอนปิดแท็บ
  const [pendingCount, setPendingCount] = useState(0)

  const selectedQty = quantityProducts.find((p) => p.id === qtyProductId) ?? null
  const maxQty = selectedQty?.inStock ?? 0

  /**
   * ค่าฟอร์มล่าสุดแบบ ref - ลูกค้า/โปรเจค/หมายเหตุ ใช้ค่าตอนกดยืนยัน
   * (ผู้ใช้มักยิงของก่อน แล้วค่อยเลือกลูกค้า/โปรเจคทีหลัง)
   * ส่วน "เหตุผล" ถูก snapshot ไว้ตอนยิงรายชิ้น เพราะอาจยิงปนกันหลายเหตุผลในรอบเดียว
   */
  const formRef = useRef({ reason: 'SALE', customerId: '', projectId: '', note: '' })
  useEffect(() => {
    formRef.current = { reason, customerId, projectId, note }
  })

  const onScan = useCallback(async (serial: string): Promise<ScanOutcomeLike> => {
    // ยังไม่เบิกจริง แค่เข้าคิวรอบันทึก - จำเหตุผลตอนยิงของชิ้นนี้ไว้
    return {
      accepted: true,
      result: 'PENDING',
      message: 'รอยืนยันการเบิกออก',
      serial,
      product: null,
      reason: formRef.current.reason,
    }
  }, [])

  const onConfirm = useCallback(async (items: FeedItem[]) => {
    const outcomes: ScanOutcomeLike[] = []
    // ลูกค้า/โปรเจคอ่านตอนกดยืนยัน (เลือกลูกค้าทีหลังก็ต้องมีผล) แต่เหตุผลใช้ของตอนยิงรายชิ้น
    const form = formRef.current
    for (const item of items) {
      try {
        outcomes.push(await api<ScanOutcomeLike>('/api/scan/out', {
          method: 'POST',
          body: JSON.stringify({
            serial: item.serial,
            reason: item.reason ?? form.reason,
            customerId: form.customerId || null,
            projectId: form.projectId || null,
            note: form.note || null,
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
    // เบิกสำเร็จ = ยอดคงเหลือ/รายการเปลี่ยนแล้ว โหลดข้อมูลใหม่กัน dropdown ค้าง
    if (outcomes.some((o) => o.accepted)) router.refresh()
    return outcomes
  }, [])

  // ลบออกจากคิว = ยังไม่เคยเบิกจริง แค่เอาออกจากรายการ ไม่ต้องเรียก API
  const onDelete = useCallback(async () => {}, [])

  const handleFeedChange = useCallback((items: FeedItem[]) => {
    setPendingCount(items.length)
  }, [])

  // กันเผลอเปลี่ยนหน้า/ปิดแท็บทั้งที่ยังมีของรอ confirm (ของจะไม่ถูกเบิก)
  useEffect(() => {
    if (pendingCount === 0) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pendingCount])

  async function submitQuantity(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedQty || qtyBusy) return
    const amount = Number(qty)
    if (!Number.isInteger(amount) || amount < 1 || amount > 999999) {
      setQtyMessage({ ok: false, text: 'จำนวนต้องเป็นจำนวนเต็ม 1–999999' })
      return
    }
    setQtyBusy(true)
    setQtyMessage(null)
    try {
      const res = await api<{ message: string; productInStock: number; quantity: number }>(
        '/api/quantity/out',
        {
          method: 'POST',
          body: JSON.stringify({
            productId: selectedQty.id,
            quantity: amount,
            reason,
            customerId: customerId || null,
            projectId: projectId || null,
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
          className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${
            mode === 'SERIAL' ? 'border-sky-400 bg-sky-300 text-sky-950 dark:border-sky-600 dark:bg-sky-800 dark:text-sky-100' : 'border-sky-200 bg-white text-slate-600 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
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
          className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${
            mode === 'QUANTITY' ? 'border-sky-400 bg-sky-300 text-sky-950 dark:border-sky-600 dark:bg-sky-800 dark:text-sky-100' : 'border-sky-200 bg-white text-slate-600 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          กรอกจำนวน
        </button>
      </div>

      <div className="card-pop grid gap-4 p-4 sm:p-5 sm:grid-cols-2">
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
          {customers.length === 0 && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">เพิ่มลูกค้าได้ที่เมนูจัดการข้อมูล</p>}
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
        {showProject && (
          <div className="sm:col-span-2" data-testid="project-field">
            <label className="label" htmlFor="project-select">
              โปรเจค (ไม่บังคับ - งานที่ลูกค้าซื้อของชุดนี้)
            </label>
            <div className="flex flex-wrap gap-2">
              <select
                id="project-select"
                data-testid="project-select"
                className="field flex-1"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">— ไม่ระบุโปรเจค —</option>
                {customerProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <input
                data-testid="project-new-name"
                className="field"
                placeholder="ชื่อโปรเจคใหม่ เช่น ติดกล้อง ตึก 1"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void createProject()
                  }
                }}
              />
              <button
                type="button"
                data-testid="project-create"
                className="btn-pop"
                disabled={creatingProject || !newProjectName.trim()}
                onClick={() => void createProject()}
              >
                {creatingProject ? 'กำลังสร้าง...' : 'เพิ่มโปรเจค'}
              </button>
            </div>
            {projectError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{projectError}</p>
            )}
          </div>
        )}
      </div>

      {mode === 'SERIAL' ? (
        <ScanConsole
          onScan={onScan}
          onDelete={onDelete}
          onConfirm={onConfirm}
          onFeedChange={handleFeedChange}
          label="ยิง serial ที่จะเบิกออก"
          rejectDuplicateInFeed
        />
      ) : (
        <form onSubmit={submitQuantity} className="card-pop space-y-3 p-4 sm:p-5" data-testid="quantity-out-form">
          <div>
            <label className="label" htmlFor="quantity-product-select">
              สินค้าที่จะเบิกออก
            </label>
            <ProductPicker
              testid="quantity-product-select"
              options={quantityProducts.map((p) => ({
                id: p.id,
                sku: p.sku,
                name: p.name,
                categoryName: p.categoryName,
                stockText: `เหลือ ${p.inStock} ${p.unitLabel ?? 'ชิ้น'}`,
                disabled: p.inStock <= 0,
                disabledHint: '— หมด',
              }))}
              value={qtyProductId}
              onChange={(id) => {
                setQtyProductId(id)
                setQtyMessage(null)
              }}
            />
            {quantityProducts.length === 0 && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
                className="btn-pop shrink-0"
                disabled={qtyBusy || !selectedQty || maxQty <= 0}
              >
                {qtyBusy ? 'กำลังบันทึก…' : 'เบิกออก'}
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
      )}
    </div>
  )
}

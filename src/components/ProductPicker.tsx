'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export type PickerOption = {
  id: string
  sku: string
  name: string
  brand?: string | null
  categoryName: string
  /** ข้อความยอดคงเหลือโชว์ท้ายแถว เช่น "เหลือ 5 ตู้" */
  stockText?: string | null
  /** true = เลือกไม่ได้ (เช่น ของหมด) */
  disabled?: boolean
  disabledHint?: string | null
}

/** กรองตัวเลือกตามคำค้น - เทียบ SKU/ชื่อ/แบรนด์/หมวด แยกเช็กทีละคำ */
export function filterPickerOptions(options: PickerOption[], query: string): PickerOption[] {
  const words = query.trim().toUpperCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return options
  return options.filter((o) => {
    const hay = `${o.sku} ${o.name} ${o.brand ?? ''} ${o.categoryName}`.toUpperCase()
    return words.every((w) => hay.includes(w))
  })
}

/**
 * ช่องเลือกสินค้าแบบพิมพ์ค้นหา - แทน <select> ธรรมดาที่เลื่อนหาช้าเมื่อ SKU เยอะ
 * พิมพ์กรองได้ ใช้คีย์บอร์ด (↑↓ Enter Esc) หรือเมาส์ก็ได้
 */
export function ProductPicker({
  options,
  value,
  onChange,
  testid = 'product-select',
  placeholder = 'พิมพ์ค้นหา SKU / ชื่อสินค้า...',
  disabled = false,
}: {
  options: PickerOption[]
  value: string
  onChange: (id: string) => void
  testid?: string
  placeholder?: string
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.id === value) ?? null
  const filtered = useMemo(() => filterPickerOptions(options, query), [options, query])
  const selectable = useMemo(() => filtered.filter((o) => !o.disabled), [filtered])

  // ปิด dropdown เมื่อคลิกที่อื่น
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open ])

  function pick(id: string) {
    onChange(id)
    setQuery('')
    setOpen(false)
    setHighlight(0)
    // เลือกแล้วยังอยู่ในช่องนี้ต่อได้เลย (ยิง/กรอกขั้นต่อไป)
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (selectable.length === 0) return
      setHighlight((h) => {
        const dir = e.key === 'ArrowDown' ? 1 : -1
        return (h + dir + selectable.length) % selectable.length
      })
    } else if (e.key === 'Enter') {
      const target = selectable[highlight] ?? selectable[0]
      if (open && target) {
        e.preventDefault()
        pick(target.id)
      }
    } else if (e.key === 'Escape') {
      setQuery('')
      setOpen(false)
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <input
        ref={inputRef}
        id={testid}
        data-testid={testid}
        className="field"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={selected && !open && !query ? `${selected.sku} · ${selected.name}` : placeholder}
        value={open || query ? query : (selected ? `${selected.sku} · ${selected.name}` : '')}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${testid}-listbox`}
        aria-autocomplete="list"
      />
      {selected && !disabled && (
        <button
          type="button"
          aria-label="ล้างสินค้าที่เลือก"
          onClick={() => {
            onChange('')
            setQuery('')
            inputRef.current?.focus()
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-1.5 py-0.5 text-sm text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          ×
        </button>
      )}
      {open && !disabled && (
        <ul
          role="listbox"
          id={`${testid}-listbox`}
          data-testid={`${testid}-options`}
          className="absolute right-0 left-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">ไม่พบสินค้าที่ตรงกับคำค้น</li>
          )}
          {filtered.map((o) => {
            const hIndex = selectable.findIndex((s) => s.id === o.id)
            const active = hIndex >= 0 && hIndex === highlight
            return (
              <li
                key={o.id}
                role="option"
                aria-selected={o.id === value}
                aria-disabled={o.disabled}
                data-testid="product-option"
                data-value={o.id}
                onMouseDown={(e) => {
                  // ใช้ mousedown แทน click เพราะ blur จะปิด dropdown ก่อน click ทำงาน
                  e.preventDefault()
                  if (!o.disabled) pick(o.id)
                }}
                onMouseEnter={() => {
                  if (hIndex >= 0) setHighlight(hIndex)
                }}
                className={`flex cursor-pointer items-baseline gap-2 px-3 py-2 text-sm ${
                  o.disabled
                    ? 'cursor-not-allowed text-slate-400'
                    : active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="font-mono font-medium">{o.sku}</span>
                <span className="min-w-0 flex-1 truncate">
                  {o.name}
                  <span className={o.disabled || active ? '' : 'text-slate-400'}>
                    {' '}
                    · {o.categoryName}
                  </span>
                </span>
                {o.stockText && (
                  <span
                    className={`shrink-0 text-xs ${o.disabled ? '' : active ? 'text-slate-200' : 'text-slate-500'}`}
                  >
                    {o.stockText}
                    {o.disabled && o.disabledHint ? ` ${o.disabledHint}` : ''}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

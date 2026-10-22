import { describe, expect, it } from 'vitest'
import { filterPickerOptions, pickEnterOption, type PickerOption } from '@/components/ProductPicker'

const options: PickerOption[] = [
  { id: 'p1', sku: 'AP-UNF-U6L', name: 'UniFi U6 Lite', brand: 'UniFi', categoryName: 'Access Point' },
  { id: 'p2', sku: 'SW-CIS-8P', name: 'Cisco CBS110 8 พอร์ต', brand: 'Cisco', categoryName: 'Switch' },
  { id: 'p3', sku: 'RACK-19-9U', name: 'ตู้แร็คแขวนผนัง 9U', brand: null, categoryName: 'ตู้แร็ค' },
]

describe('filterPickerOptions', () => {
  it('คำค้นว่าง -> แสดงทั้งหมด', () => {
    expect(filterPickerOptions(options, '')).toHaveLength(3)
    expect(filterPickerOptions(options, '   ')).toHaveLength(3)
  })

  it('ค้นด้วย SKU บางส่วน (ตัวเล็กก็เจอ)', () => {
    expect(filterPickerOptions(options, 'ap-unf').map((o) => o.id)).toEqual(['p1'])
    expect(filterPickerOptions(options, 'rack').map((o) => o.id)).toEqual(['p3'])
  })

  it('ค้นด้วยชื่อ/แบรนด์/หมวด', () => {
    expect(filterPickerOptions(options, 'cisco').map((o) => o.id)).toEqual(['p2'])
    expect(filterPickerOptions(options, 'ตู้แร็ค').map((o) => o.id)).toEqual(['p3'])
    expect(filterPickerOptions(options, 'switch').map((o) => o.id)).toEqual(['p2'])
  })

  it('หลายคำต้องตรงทุกคำ', () => {
    expect(filterPickerOptions(options, 'unifi lite').map((o) => o.id)).toEqual(['p1'])
    expect(filterPickerOptions(options, 'unifi cisco')).toHaveLength(0)
  })

  it('ไม่ตรงเลย -> ว่าง', () => {
    expect(filterPickerOptions(options, 'ไม่มีของนี้')).toHaveLength(0)
  })
})

describe('pickEnterOption', () => {
  it('ยังไม่พิมพ์และยังไม่เลื่อนด้วยลูกศร -> ปล่อย Enter ให้ฟอร์ม', () => {
    expect(pickEnterOption(options, '', 0, false)).toBeNull()
  })

  it('เลื่อนด้วยลูกศรแล้ว -> เลือกตัวที่ highlight แม้มี exact match', () => {
    expect(pickEnterOption(options, 'SW-CIS-8P', 2, true)?.id).toBe('p3')
  })

  it('พิมพ์ SKU เป๊ะ -> เลือกตัวนั้น ไม่ใช่ตัวแรก', () => {
    expect(pickEnterOption(options, 'rack-19-9u', 0, false)?.id).toBe('p3')
  })

  it('พิมพ์คำค้นแต่ไม่มี exact match -> เลือกตัวแรกของรายการที่กรองแล้ว', () => {
    expect(
      pickEnterOption(filterPickerOptions(options, 'cisco'), 'cisco', 0, false)?.id
    ).toBe('p2')
  })

  it('ไม่มีตัวเลือกที่เลือกได้ -> null', () => {
    expect(pickEnterOption([], 'cisco', 0, false)).toBeNull()
  })
})

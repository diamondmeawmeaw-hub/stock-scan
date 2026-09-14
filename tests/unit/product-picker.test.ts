import { describe, expect, it } from 'vitest'
import { filterPickerOptions, type PickerOption } from '@/components/ProductPicker'

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

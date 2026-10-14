/** หน่วยนับมาตรฐาน - กันสะกดมั่ว (ชิ้น/อัน/ใบ ปนกัน) ค่าเก่าที่เพี้ยนอยู่แล้วแสดงตามเดิม ไม่บังคับแก้ */
export const UNIT_LABELS = ['ชิ้น', 'อัน', 'เครื่อง', 'กล่อง', 'เมตร', 'ม้วน', 'ชุด', 'ตู้', 'ใบ'] as const
export const UNIT_CUSTOM = '__custom__'

export function isStandardUnit(value: string): boolean {
  return (UNIT_LABELS as readonly string[]).includes(value)
}

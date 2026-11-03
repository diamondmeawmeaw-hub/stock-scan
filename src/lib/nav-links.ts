/**
 * รายการเมนูที่ใช้ร่วมกันระหว่าง NavBar (จอใหญ่) และ MobileTabBar (มือถือ)
 * แก้ชื่อ/เพิ่มเมนูที่เดียวแล้วมีผลทั้งสองที่
 */
export type NavLink = {
  href: string
  label: string
  /** เฉพาะผู้ดูแลระบบ */
  adminOnly?: boolean
}

/** 4 แท็บหลักบนมือถือ */
export const PRIMARY_LINKS: NavLink[] = [
  { href: '/', label: 'หน้าหลัก' },
  { href: '/scan-in', label: 'รับเข้า' },
  { href: '/scan-out', label: 'เบิกออก' },
  { href: '/audit', label: 'ตรวจนับ' },
]

/** เมนูรอง - อยู่ใต้ "เพิ่มเติม" บนมือถือ และต่อท้ายเมนูหลักบนจอใหญ่ */
export const SECONDARY_LINKS: NavLink[] = [
  { href: '/serials', label: 'ค้นหา Serial' },
  { href: '/sales', label: 'ประวัติการขาย' },
  { href: '/reports', label: 'รายงาน' },
]

export const MANAGE_LINKS: NavLink[] = [
  { href: '/products', label: 'สินค้า' },
  { href: '/categories', label: 'ประเภทของ' },
  { href: '/vendors', label: 'ซื้อจาก' },
  { href: '/customers', label: 'ลูกค้า' },
  { href: '/users', label: 'ผู้ใช้', adminOnly: true },
]

/** เมนูแถวบนของจอใหญ่ = แท็บหลัก + เมนูรอง */
export const MAIN_LINKS: NavLink[] = [...PRIMARY_LINKS, ...SECONDARY_LINKS]

/** เมนูย่อยในแท็บ "เพิ่มเติม" (ไม่รวมแท็บหลัก) */
export const MORE_LINKS: NavLink[] = [...SECONDARY_LINKS, ...MANAGE_LINKS]

export const isActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname.startsWith(href)

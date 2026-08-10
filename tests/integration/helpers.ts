/**
 * เครื่องมือช่วยเทส: เรียก route handler ของ Next ตรงๆ เหมือน request จริง
 * (ไม่ผ่าน HTTP server จึงเร็ว แต่ยังผ่าน zod, auth, service และฐานข้อมูลจริงครบ)
 */
import { hashPassword } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST as loginRoute } from '@/app/api/auth/login/route'

export { prisma }

// route handler ของ Next ประกาศ params เจาะจง (เช่น Promise<{ id: string }>)
// ฝั่งเทสส่ง params เป็น Record ทั่วไป จึงต้องรับแบบกว้างไว้
type RouteContext = { params: Promise<any> }
type Handler = (request: Request, context: RouteContext) => Promise<Response>

export type JsonResponse<T = any> = { status: number; body: T }

const BASE = 'http://localhost:3000'

async function call<T>(
  handler: Handler,
  init: {
    method: string
    path?: string
    body?: unknown
    params?: Record<string, string>
    query?: Record<string, string>
  }
): Promise<JsonResponse<T>> {
  const url = new URL(`${BASE}${init.path ?? '/api/test'}`)
  for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value)
  const request = new Request(url, {
    method: init.method,
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const response = await handler(request, { params: Promise.resolve(init.params ?? {}) })
  return { status: response.status, body: (await response.json()) as T }
}

export function postJson<T = any>(
  handler: Handler,
  body?: unknown,
  params?: Record<string, string>
) {
  return call<T>(handler, { method: 'POST', body: body ?? {}, params })
}

export function getJson<T = any>(
  handler: Handler,
  params?: Record<string, string>,
  query?: Record<string, string>
) {
  return call<T>(handler, { method: 'GET', params, query })
}

export function patchJson<T = any>(
  handler: Handler,
  body: unknown,
  params?: Record<string, string>
) {
  return call<T>(handler, { method: 'PATCH', body, params })
}

export function deleteJson<T = any>(handler: Handler, params?: Record<string, string>) {
  return call<T>(handler, { method: 'DELETE', params })
}

/** สำหรับ endpoint ที่ตอบเป็นไฟล์ - อ่านเป็น Buffer แทน JSON */
export async function getBinary(
  handler: Handler,
  query?: Record<string, string>
): Promise<{ status: number; headers: Headers; buffer: Buffer }> {
  const url = new URL(`${BASE}/api/test`)
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)
  const response = await handler(new Request(url), { params: Promise.resolve({}) })
  return {
    status: response.status,
    headers: response.headers,
    buffer: Buffer.from(await response.arrayBuffer()),
  }
}

// ────────────────────────────── ข้อมูลตั้งต้น ──────────────────────────────

export async function createUser(
  input: { username?: string; password?: string; role?: 'ADMIN' | 'STAFF' } = {}
) {
  const username = input.username ?? 'staff'
  const password = input.password ?? 'staff123'
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(password),
      displayName: username,
      role: input.role ?? 'STAFF',
    },
  })
  return { ...user, password }
}

/** login ผ่าน route จริง - คุกกี้ถูกเซ็ตเข้าโถจำลอง ทำให้ request ถัดๆ ไปมี session */
export async function login(username: string, password: string) {
  const res = await postJson(loginRoute as Handler, { username, password })
  if (res.status !== 200) throw new Error(`login ไม่สำเร็จ: ${JSON.stringify(res.body)}`)
  return res.body.user as { userId: string; username: string; role: 'ADMIN' | 'STAFF' }
}

/**
 * ชุดข้อมูลมาตรฐานที่เทสส่วนใหญ่ต้องใช้: ผู้ใช้ที่ login แล้ว + 2 หมวด + 3 สินค้า
 */
export async function seedFixtures() {
  const user = await createUser({ username: 'staff', password: 'staff123' })
  const admin = await createUser({ username: 'admin', password: 'admin123', role: 'ADMIN' })

  const it = await prisma.category.create({ data: { code: 'IT', name: 'อุปกรณ์ไอที' } })
  const tool = await prisma.category.create({ data: { code: 'TOOL', name: 'เครื่องมือช่าง' } })

  const notebook = await prisma.product.create({
    data: { sku: 'IT-NB-001', name: 'โน๊ตบุ๊ค', brand: 'Dell', categoryId: it.id },
  })
  const monitor = await prisma.product.create({
    data: { sku: 'IT-MON-002', name: 'จอมอนิเตอร์', brand: 'Dell', categoryId: it.id },
  })
  const drill = await prisma.product.create({
    data: { sku: 'TL-DRL-001', name: 'สว่านไร้สาย', brand: 'Makita', categoryId: tool.id },
  })

  await login(user.username, user.password)

  return { user, admin, categories: { it, tool }, products: { notebook, monitor, drill } }
}

/** ใส่ของเข้าคลังตรงๆ ผ่านฐานข้อมูล ใช้ตั้งต้นสถานะก่อนเริ่มเทส */
export async function giveStock(productId: string, serials: string[]) {
  await prisma.serialUnit.createMany({
    data: serials.map((serial) => ({
      serial,
      productId,
      status: 'IN_STOCK' as const,
      receivedAt: new Date(),
    })),
  })
}

export async function unitBySerial(serial: string) {
  return prisma.serialUnit.findUnique({ where: { serial } })
}

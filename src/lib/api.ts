import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { HttpError } from './auth'

/** ห่อ handler ของ API route ให้แปลง error เป็น JSON รูปแบบเดียวกันทั้งระบบ */
export async function route<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn()
    return NextResponse.json(data ?? { ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}

/** เหมือน route() แต่ให้ handler คุม Response เอง สำหรับ endpoint ที่ตอบเป็นไฟล์ ไม่ใช่ JSON */
export async function fileRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (err) {
    return errorResponse(err)
  }
}

function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง', issues: err.issues.map((i) => i.message) },
      { status: 400 }
    )
  }
  if (isPrismaUniqueError(err)) {
    return NextResponse.json({ error: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' }, { status: 409 })
  }
  console.error('[api] unhandled error', err)
  return NextResponse.json({ error: 'เกิดข้อผิดพลาดในระบบ' }, { status: 500 })
}

function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
  )
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new HttpError(400, 'รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น JSON)')
  }
}

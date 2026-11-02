import { beforeEach, describe, expect, it } from 'vitest'
import { POST as loginRoute } from '@/app/api/auth/login/route'
import { createUser, postJson } from './helpers'

async function loginDirect(username: string, password: string): Promise<Response> {
  return loginRoute(
    new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
  )
}

describe('login rate limit', () => {
  beforeEach(async () => {
    await createUser({ username: 'limit-one', password: 'limit123' })
    await createUser({ username: 'limit-two', password: 'limit123' })
  })

  it('รหัสผิดครบ 5 ครั้ง -> ครั้งถัดไป 429 พร้อม Retry-After แม้รหัสจะถูก', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await postJson(loginRoute, { username: 'limit-one', password: 'wrong' })
      expect(res.status).toBe(401)
    }

    const blocked = await postJson<{ error: string }>(loginRoute, {
      username: 'limit-one',
      password: 'limit123',
    })
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toContain('บ่อยเกินไป')

    const direct = await loginDirect('limit-one', 'limit123')
    expect(direct.status).toBe(429)
    expect(Number(direct.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('login สำเร็จก่อนครบ 5 ครั้ง -> ล้างจำนวนครั้งของผู้ใช้นั้น', async () => {
    for (let i = 0; i < 4; i++) {
      expect(
        (await postJson(loginRoute, { username: 'limit-two', password: 'wrong' })).status
      ).toBe(401)
    }

    expect(
      (await postJson(loginRoute, { username: 'limit-two', password: 'limit123' })).status
    ).toBe(200)

    expect(
      (await postJson(loginRoute, { username: 'limit-two', password: 'wrong' })).status
    ).toBe(401)
    expect(
      (await postJson(loginRoute, { username: 'limit-two', password: 'limit123' })).status
    ).toBe(200)
  })
})

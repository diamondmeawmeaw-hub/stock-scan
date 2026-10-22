import { beforeEach, describe, expect, it } from 'vitest'
import {
  GET as listRoute,
  POST as uploadRoute,
} from '@/app/api/serials/[serial]/images/route'
import {
  DELETE as deleteRoute,
  GET as fileRoute,
} from '@/app/api/serials/[serial]/images/[id]/route'
import { PATCH as patchCategoryRoute } from '@/app/api/categories/[id]/route'
import { POST as createCategoryRoute } from '@/app/api/categories/route'
import { getJson, deleteJson, giveStock, login, patchJson, postJson, prisma, seedFixtures, type Handler } from './helpers'

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>
let fx: Fixtures

/** PNG 1×1 พิกเซล - ใช้ตรวจลายเซ็นไฟล์จริง */
const PNG: Uint8Array<ArrayBuffer> = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
)

async function upload(
  serial: string,
  opts: { bytes?: Uint8Array<ArrayBuffer>; name?: string; type?: string; label?: string } = {}
) {
  const form = new FormData()
  form.append(
    'file',
    new File([opts.bytes ?? PNG], opts.name ?? 'nvr.png', { type: opts.type ?? 'image/png' })
  )
  if (opts.label !== undefined) form.append('label', opts.label)

  const res = await (uploadRoute as unknown as Handler)(
    new Request('http://localhost:3000/api/serials/' + encodeURIComponent(serial) + '/images', {
      method: 'POST',
      body: form,
    }),
    { params: Promise.resolve({ serial }) }
  )
  return { status: res.status, body: (await res.json()) as any }
}

function list(serial: string) {
  return getJson(listRoute as unknown as Handler, { serial })
}

async function fetchFile(serial: string, id: string, query?: Record<string, string>) {
  const url = new URL(`http://localhost:3000/api/serials/${serial}/images/${id}`)
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)
  const res = await (fileRoute as unknown as Handler)(new Request(url), {
    params: Promise.resolve({ serial, id }),
  })
  return {
    status: res.status,
    headers: res.headers,
    buffer: Buffer.from(await res.arrayBuffer()),
  }
}

const remove = (serial: string, id: string) =>
  deleteJson(deleteRoute as unknown as Handler, { serial, id })

describe('รูปอุปกรณ์ต่อ serial (ใช้ตอนเครม)', () => {
  beforeEach(async () => {
    fx = await seedFixtures()
    // ฟีเจอร์รูปเปิดเฉพาะประเภทของที่ผู้ดูแลระบบเลือก (ในระบบจริงคือ NVR)
    await prisma.category.update({
      where: { id: fx.categories.it.id },
      data: { photosEnabled: true },
    })
    await giveStock(fx.products.notebook.id, ['NB-0001', 'NB-0002'])
  })

  it('ยังไม่ login -> 401', async () => {
    const { __clearCookies } = await import('./mocks/next-headers')
    __clearCookies()
    expect((await list('NB-0001')).status).toBe(401)
    expect((await upload('NB-0001')).status).toBe(401)
  })

  it('แนบรูปแล้วเห็นในรายการ พร้อมคำอธิบายเริ่มต้น "รูปตัวอุปกรณ์"', async () => {
    const res = await upload('NB-0001')
    expect(res.status).toBe(200)
    expect(res.body.image.label).toBe('รูปตัวอุปกรณ์')
    expect(res.body.image.fileName).toBe('nvr.png')
    expect(res.body.image.mimeType).toBe('image/png')
    expect(res.body.image.size).toBe(PNG.byteLength)
    expect(res.body.image.uploadedByName).toBe('staff')

    const listed = await list('NB-0001')
    expect(listed.status).toBe(200)
    expect(listed.body.maxImages).toBe(8)
    expect(listed.body.images).toHaveLength(1)
    // รายการต้องไม่พ่วงไบต์รูปมาด้วย
    expect(listed.body.images[0].data).toBeUndefined()
  })

  it('ระบุคำอธิบายเองได้ และตัดช่องว่างหัวท้าย', async () => {
    const res = await upload('NB-0001', { label: '  หน้ากาก NVR  ' })
    expect(res.status).toBe(200)
    expect(res.body.image.label).toBe('หน้ากาก NVR')
  })

  it('ดาวน์โหลดไฟล์ได้ครบ ไม่เพี้ยน', async () => {
    const { body } = await upload('NB-0001')
    const id = body.image.id

    const inline = await fetchFile('NB-0001', id)
    expect(inline.status).toBe(200)
    expect(inline.headers.get('content-type')).toBe('image/png')
    expect(inline.headers.get('content-length')).toBe(String(PNG.byteLength))
    expect(inline.headers.get('x-content-type-options')).toBe('nosniff')
    expect(inline.headers.get('content-disposition')).toContain('inline')
    expect(Buffer.compare(inline.buffer, Buffer.from(PNG))).toBe(0)

    const download = await fetchFile('NB-0001', id, { download: '1' })
    expect(download.headers.get('content-disposition')).toContain('attachment')
    expect(download.headers.get('content-disposition')).toContain('filename*=UTF-8')
  })

  it('ลบรูปได้ และไฟล์หายจริง', async () => {
    const { body } = await upload('NB-0001')
    const id = body.image.id

    expect((await remove('NB-0001', id)).status).toBe(200)
    expect((await list('NB-0001')).body.images).toHaveLength(0)
    expect((await fetchFile('NB-0001', id)).status).toBe(404)
    // ลบซ้ำ -> 404
    expect((await remove('NB-0001', id)).status).toBe(404)
  })

  it('ไฟล์ที่ไม่ใช่รูปจริงถูกปฏิเสธ (แม้ตั้งชื่อ .png)', async () => {
    const fake: Uint8Array<ArrayBuffer> = new Uint8Array(new TextEncoder().encode('hello, not an image'))
    const res = await upload('NB-0001', { bytes: fake, name: 'fake.png', type: 'image/png' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('ไม่ใช่รูปภาพ')

    const text = await upload('NB-0001', { bytes: fake, name: 'note.txt', type: 'text/plain' })
    expect(text.status).toBe(400)

    expect((await list('NB-0001')).body.images).toHaveLength(0)
  })

  it('serial ที่ไม่มีในคลัง -> 404', async () => {
    expect((await list('NOPE-9999')).status).toBe(404)
    const res = await upload('NOPE-9999')
    expect(res.status).toBe(404)
    expect(res.body.error).toContain('ไม่พบ serial')
  })

  it('รูปของเครื่องหนึ่งไม่โผล่ที่เครื่องอื่น', async () => {
    const { body } = await upload('NB-0001')
    expect((await list('NB-0002')).body.images).toHaveLength(0)
    expect((await fetchFile('NB-0002', body.image.id)).status).toBe(404)
    expect((await remove('NB-0002', body.image.id)).status).toBe(404)
  })

  it('แนบได้สูงสุด 8 รูปต่อเครื่อง', async () => {
    for (let i = 0; i < 8; i += 1) {
      expect((await upload('NB-0001')).status).toBe(200)
    }
    const ninth = await upload('NB-0001')
    expect(ninth.status).toBe(400)
    expect(ninth.body.error).toContain('สูงสุด 8 รูป')
    expect((await list('NB-0001')).body.images).toHaveLength(8)
  })

  it('ลบเครื่อง (SerialUnit) แล้วรูปถูกลบตาม (cascade)', async () => {
    await upload('NB-0001')
    const unit = await prisma.serialUnit.findUnique({ where: { serial: 'NB-0001' } })
    await prisma.serialUnit.delete({ where: { id: unit!.id } })
    expect(await prisma.serialImage.count()).toBe(0)
  })

  it('ประเภทของที่ยังไม่เปิดเก็บรูป -> แนบไม่ได้ แต่ยังดูรายการได้', async () => {
    await giveStock(fx.products.drill.id, ['TL-0001'])

    const res = await upload('TL-0001')
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('ยังไม่เปิดให้เก็บรูป')

    const listed = await list('TL-0001')
    expect(listed.status).toBe(200)
    expect(listed.body.photosEnabled).toBe(false)
    expect(listed.body.images).toHaveLength(0)
  })

  it('เฉพาะผู้ดูแลระบบที่เปิด/ปิดการเก็บรูปของประเภทได้', async () => {
    const patch = (body: unknown) =>
      patchJson(patchCategoryRoute as unknown as Handler, body, { id: fx.categories.tool.id })

    // staff แก้ชื่อประเภทได้ตามปกติ แต่ตั้งค่าการเก็บรูปไม่ได้
    const staffName = await patch({ name: 'เครื่องมือช่าง (แก้ชื่อ)' })
    expect(staffName.status).toBe(200)

    const staffPhotos = await patch({ photosEnabled: true })
    expect(staffPhotos.status).toBe(403)
    expect(staffPhotos.body.error).toContain('ผู้ดูแลระบบ')

    // staff สร้างประเภทพร้อมตั้งค่าเก็บรูปก็ไม่ได้
    const staffCreate = await postJson(createCategoryRoute as unknown as Handler, {
      code: 'NVR2',
      name: 'เครื่องบันทึก 2',
      photosEnabled: true,
    })
    expect(staffCreate.status).toBe(403)

    // admin ตั้งค่าได้
    await login('admin', 'admin123')
    const adminPhotos = await patch({ photosEnabled: true })
    expect(adminPhotos.status).toBe(200)
    expect(adminPhotos.body.category.photosEnabled).toBe(true)

    const adminCreate = await postJson(createCategoryRoute as unknown as Handler, {
      code: 'NVR2',
      name: 'เครื่องบันทึก 2',
      photosEnabled: true,
    })
    expect(adminCreate.status).toBe(200)
    expect(adminCreate.body.category.photosEnabled).toBe(true)
  })
})

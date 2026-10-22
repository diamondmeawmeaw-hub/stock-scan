import { route } from '@/lib/api'
import { HttpError, requireUser } from '@/lib/auth'
import { listSerialImages, saveSerialImage } from '@/lib/serial-images'

export const runtime = 'nodejs'

type Params = { params: Promise<{ serial: string }> }

/** รายการรูปของเครื่องนี้ (ไม่ส่งไบต์รูปมาด้วย - ดึงทีละรูปจาก endpoint ย่อย) */
export async function GET(_request: Request, { params }: Params) {
  return route(async () => {
    await requireUser()
    const { serial } = await params
    return listSerialImages(decodeURIComponent(serial))
  })
}

/** แนบรูปใหม่ - multipart/form-data: file (required), label (optional) */
export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const user = await requireUser()
    const { serial } = await params

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      throw new HttpError(400, 'อ่านไฟล์ที่แนบมาไม่ได้')
    }

    const file = form.get('file')
    if (!file || typeof file === 'string') {
      throw new HttpError(400, 'ต้องแนบไฟล์รูปมา 1 ไฟล์')
    }

    return saveSerialImage({
      rawSerial: decodeURIComponent(serial),
      file,
      label: form.get('label'),
      userId: user.userId,
    })
  })
}

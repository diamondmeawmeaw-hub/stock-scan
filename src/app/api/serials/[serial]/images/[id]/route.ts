import { fileRoute, route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { deleteSerialImage, getSerialImage } from '@/lib/serial-images'

export const runtime = 'nodejs'

type Params = { params: Promise<{ serial: string; id: string }> }

/** ดึงไฟล์รูป - เติม ?download=1 เพื่อบังคับให้เบราว์เซอร์ดาวน์โหลดแทนการเปิดดู */
export async function GET(request: Request, { params }: Params) {
  return fileRoute(async () => {
    await requireUser()
    const { serial, id } = await params
    const image = await getSerialImage({
      rawSerial: decodeURIComponent(serial),
      imageId: id,
    })

    const download = new URL(request.url).searchParams.get('download') === '1'
    // ชื่อไฟล์แบบ ASCII สำหรับเบราว์เซอร์เก่า + filename* แบบ UTF-8 สำหรับชื่อไทย
    const asciiName = image.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    const disposition =
      `${download ? 'attachment' : 'inline'}; filename="${asciiName}"; ` +
      `filename*=UTF-8''${encodeURIComponent(image.fileName)}`

    return new Response(new Uint8Array(image.data), {
      headers: {
        'Content-Type': image.mimeType,
        'Content-Length': String(image.size),
        'Content-Disposition': disposition,
        // id ของรูปไม่เปลี่ยนตลอดอายุ จึงแคชได้ยาว แต่เป็นข้อมูลเฉพาะผู้ใช้ที่ล็อกอิน
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })
}

/** ลบรูป - STAFF และ ADMIN ทำได้ (คนหน้างานต้องลบรูปเสียได้เอง) */
export async function DELETE(_request: Request, { params }: Params) {
  return route(async () => {
    await requireUser()
    const { serial, id } = await params
    return deleteSerialImage({
      rawSerial: decodeURIComponent(serial),
      imageId: id,
    })
  })
}

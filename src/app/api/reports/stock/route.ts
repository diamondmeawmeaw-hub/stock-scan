import { route } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { buildStockReport } from '@/lib/scan-service'

export async function GET(request: Request) {
  return route(async () => {
    await requireUser()
    const params = new URL(request.url).searchParams
    return buildStockReport({
      categoryId: params.get('categoryId'),
      brand: params.get('brand'),
      vendorId: params.get('vendorId'),
      q: params.get('q'),
    })
  })
}

import { ScanOutClient } from './ScanOutClient'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function ScanOutPage() {
  const customers = await prisma.customer.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true } })
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">เบิกออกจากคลัง</h1>
        <p className="text-sm text-slate-500">
          เลือกเหตุผลไว้ก่อน แล้วยิง serial ได้เลย ระบบรู้เองว่าเป็นสินค้าอะไร
        </p>
      </div>
      <ScanOutClient customers={customers} />
    </div>
  )
}

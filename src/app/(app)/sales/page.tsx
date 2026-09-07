import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function SalesPage() {
  const logs = await prisma.scanLog.findMany({ where: { type: 'OUT', reason: 'SALE', accepted: true }, orderBy: { createdAt: 'desc' }, take: 200, include: { customer: true, product: true, user: true } })
  return <div className="space-y-5"><div><h1 className="text-xl font-semibold">ประวัติการขาย</h1><p className="text-sm text-slate-500">รายการเบิกออกที่มีเหตุผลเป็นขาย ({logs.length} รายการล่าสุด)</p></div><div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="px-4 py-2">เวลา</th><th className="px-4 py-2">ลูกค้า</th><th className="px-4 py-2">Serial</th><th className="px-4 py-2">สินค้า</th><th className="px-4 py-2">ผู้ทำรายการ</th><th className="px-4 py-2">หมายเหตุ</th></tr></thead><tbody className="divide-y divide-slate-100">{logs.map((log) => <tr key={log.id}><td className="whitespace-nowrap px-4 py-2 text-slate-500">{log.createdAt.toLocaleString('th-TH')}</td><td className="px-4 py-2">{log.customer ? `${log.customer.code} · ${log.customer.name}` : '-'}</td><td className="px-4 py-2"><Link className="font-mono text-sky-700 underline" href={`/serials?serial=${encodeURIComponent(log.serial)}`}>{log.serial}</Link></td><td className="px-4 py-2">{log.product?.name ?? '-'}</td><td className="px-4 py-2">{log.user.displayName}</td><td className="px-4 py-2">{log.note ?? '-'}</td></tr>)}</tbody></table></div></div></div>
}

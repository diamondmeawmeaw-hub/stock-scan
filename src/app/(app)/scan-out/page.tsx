import { ScanOutClient } from './ScanOutClient'

export default function ScanOutPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">เบิกออกจากคลัง</h1>
        <p className="text-sm text-slate-500">
          เลือกเหตุผลไว้ก่อน แล้วยิง serial ได้เลย ระบบรู้เองว่าเป็นสินค้าอะไร
        </p>
      </div>
      <ScanOutClient />
    </div>
  )
}

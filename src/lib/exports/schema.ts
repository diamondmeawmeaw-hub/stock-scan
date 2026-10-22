import { z } from 'zod'
import { isValidDateInput } from '@/lib/date-range'

const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')
  .refine(isValidDateInput, 'วันที่ที่ระบุไม่มีอยู่จริง')

/** ค่าจาก query/body ที่ว่างเปล่าให้ถือว่าไม่ได้กรอง */
const optionalText = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value?.trim() || null)

const date = DATE.nullable().optional()

const common = {
  format: z.enum(['xlsx', 'pdf'], { message: 'รูปแบบไฟล์ต้องเป็น xlsx หรือ pdf' }),
}

export const reportExportSchema = z
  .object({
    type: z.literal('reports'),
    ...common,
    view: z.enum(['stock', 'movement', 'out'], {
      message: 'ประเภทรายงานต้องเป็น stock, movement, หรือ out',
    }),
    categoryId: optionalText,
    brand: optionalText,
    vendorId: optionalText,
    q: optionalText,
    customerId: optionalText,
    timePeriod: optionalText,
    from: date,
    to: date,
  })
  .refine((value) => value.view !== 'movement' || (value.from && value.to), {
    message: 'รายงานความเคลื่อนไหวต้องระบุช่วงวันที่',
  })

export const salesExportSchema = z.object({
  type: z.literal('sales'),
  ...common,
  customerId: optionalText,
  projectId: optionalText,
  q: optionalText,
  from: date,
  to: date,
})

// reportExportSchema มี refine อยู่ จึงใช้ discriminatedUnion ไม่ได้ ต้องใช้ union ปกติ
export const exportRequestSchema = z.union([reportExportSchema, salesExportSchema])

export type ReportExportInput = z.infer<typeof reportExportSchema>
export type SalesExportInput = z.infer<typeof salesExportSchema>
export type ExportRequest = z.infer<typeof exportRequestSchema>

export const EXPORT_CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
} as const

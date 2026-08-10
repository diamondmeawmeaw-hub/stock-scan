/**
 * ค่าคงที่ของสภาพแวดล้อมเทส E2E - ใช้ร่วมกันทั้ง config, global-setup และตัวเทส
 *
 * E2E ใช้ "ฐานข้อมูลของตัวเอง" แยกจากทั้งฐานใช้งานจริงและฐาน integration test
 * เพราะทุกเคสจะล้างตารางทิ้งก่อนเริ่ม
 */
import { config as loadEnv } from 'dotenv'

loadEnv()

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://stock:stockpass@localhost:5433/stockscan_e2e?schema=public'

/** ใช้พอร์ตแยกจาก next dev ปกติ จะได้เปิดเว็บทำงานค้างไว้แล้วรันเทสพร้อมกันได้ */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3210)

/**
 * ต้องเป็น localhost ให้ตรงกับที่ middleware ใช้ตอน redirect
 * ถ้าเทสเข้าทาง 127.0.0.1 เบราว์เซอร์จะมองว่าคนละโดเมน คุกกี้ session จะหายทุกครั้งที่ถูก redirect
 */
export const E2E_HOST = process.env.E2E_HOST ?? 'localhost'
export const E2E_BASE_URL = `http://${E2E_HOST}:${E2E_PORT}`

export const E2E_AUTH_SECRET =
  process.env.E2E_AUTH_SECRET ?? 'e2e-secret-at-least-32-characters-long'

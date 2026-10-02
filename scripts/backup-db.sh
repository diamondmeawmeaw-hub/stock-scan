#!/bin/sh
# backup-db.sh - dump ฐานข้อมูล stock-scan เป็นไฟล์ gzip รายวัน
#
# รันได้ทั้งบน NAS (ผ่าน Task Scheduler) และเครื่อง dev
#   ตัวอย่าง: BACKUP_DIR=/volume1/backup/stock-scan sh scripts/backup-db.sh
#
# ค่าที่ตั้งผ่าน env (มีค่า default ครบ):
#   BACKUP_DIR     โฟลเดอร์เก็บไฟล์ dump (default: backups/ ในโฟลเดอร์โปรเจกต์)
#   RETENTION_DAYS ลบไฟล์เก่าเกินกี่วัน (default: 14)
#   DB_CONTAINER   ชื่อ container (default: stock-scan-db)
#
# ออกแบบให้เป็น POSIX sh ล้วน - ใช้ได้กับ busybox ash บน Synology
# (ไม่ใช้ pipefail/array/[[ ]] เพราะ sh ของ NAS บางเครื่องไม่รองรับ)
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_DIR=$(dirname -- "$SCRIPT_DIR")

ENV_FILE="$COMPOSE_DIR/.env"
DB_CONTAINER="${DB_CONTAINER:-stock-scan-db}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_DIR="${BACKUP_DIR:-$COMPOSE_DIR/backups}"

fail() {
  echo "backup ล้มเหลว: $1" >&2
  exit 1
}

# อ่านค่าจาก .env ของ docker-compose ถ้ามี ไม่มีใช้ค่า default
# ค่าที่ได้ไม่ได้ใช้ยิงฐานเอง (pg_dump ใน container ไม่ต้องใช้รหัสผ่าน)
# แต่เก็บไว้ให้ตรงกับค่าจริงของ compose
env_or_default() {
  key=$1
  default=$2
  value=""
  if [ -f "$ENV_FILE" ]; then
    value=$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '\r' \
      | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
  fi
  if [ -n "$value" ]; then
    printf '%s' "$value"
  else
    printf '%s' "$default"
  fi
}

PG_USER=$(env_or_default POSTGRES_USER stock)
PG_DB=$(env_or_default POSTGRES_DB stockscan)

command -v docker >/dev/null 2>&1 || fail "ไม่เจอคำสั่ง docker ในเครื่องนี้"
docker ps --format '{{.Names}}' | grep -Fxq "$DB_CONTAINER" \
  || fail "container $DB_CONTAINER ไม่ได้ทำงานอยู่ (รัน docker compose up ก่อน)"

mkdir -p "$BACKUP_DIR" || fail "สร้างโฟลเดอร์ $BACKUP_DIR ไม่ได้"

day=$(date +%Y%m%d)
final="$BACKUP_DIR/stockscan-$day.sql.gz"
tmp="$BACKUP_DIR/.stockscan-$day.sql.$$"

# dump ลงไฟล์ชั่วคราวก่อนเสมอ - ถ้าค้าง/พังไฟล์เวอร์ชันเก่าจะไม่หาย
if ! docker exec "$DB_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" > "$tmp"; then
  rm -f "$tmp"
  fail "pg_dump คืน error (ดู log: docker logs $DB_CONTAINER)"
fi
[ -s "$tmp" ] || { rm -f "$tmp"; fail "ไฟล์ dump ว่างเปล่า"; }
gzip -f "$tmp" || { rm -f "$tmp.gz"; fail "บีบไฟล์ gzip ไม่สำเร็จ"; }
mv "$tmp.gz" "$final" || fail "ย้ายไฟล์เข้า $final ไม่ได้"

# ลบของเก่าเกิน retention (find แบบ POSIX ไม่ใช้ -delete กัน busybox บางรุ่น)
find "$BACKUP_DIR" -name 'stockscan-*.sql.gz' -type f -mtime "+$RETENTION_DAYS" -exec rm -f {} +

size=$(wc -c < "$final" | tr -d ' ')
echo "backup สำเร็จ: $final (${size} bytes)"

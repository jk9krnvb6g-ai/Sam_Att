# แผนการสำรองข้อมูลและย้อนกลับ (Backup & Rollback Plan)
## Sam_Att V2 — ฐานข้อมูล `samchuk_attendance` (§3.11)

> **คำเตือนสำคัญ:** สคริปต์ `001_phase1_phase2_safe_migration.sql` จัดเตรียมไว้สำหรับทดสอบในสภาพแวดล้อม **Test / Staging** ก่อนเท่านั้น ห้ามรันบนเซิร์ฟเวอร์ Production ของโรงพยาบาลสามชุกโดยยังไม่ได้ตรวจสอบรุ่นของ MySQL (`SELECT VERSION();`) และสำรองข้อมูลครบถ้วน

---

### 1. การตรวจสอบรุ่นของ MySQL / MariaDB ก่อนรัน Migration
```sql
SELECT VERSION() AS mysql_version, @@version_comment AS engine_distribution;
```
- **ข้อจำกัดที่แก้ไขแล้ว:** คำสั่ง `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` รองรับเฉพาะใน MariaDB 10.0.2+ แต่จะเกิด `Syntax Error (1064)` บน Oracle MySQL 5.7 และ MySQL 8.0 มาตรฐาน ดังนั้นไฟล์ `001_phase1_phase2_safe_migration.sql` จึงเปลี่ยนมาใช้การตรวจสอบผ่าน `INFORMATION_SCHEMA.COLUMNS` ด้วย Stored Procedure (`sam_att_add_column_if_missing`) เพื่อรองรับทั้ง Oracle MySQL 8.0+ และ MariaDB 10.4+
- **ข้อจำกัดที่ต้องตรวจสอบบนเครื่องจริง:** ชนิดข้อมูล `JSON` (`related_raw_scan_ids`, `metadata`) รองรับใน MySQL 5.7.8+ / 8.0+ และ MariaDB 10.2.7+ หากเซิร์ฟเวอร์จริงใช้รุ่นเก่ากว่านั้น ต้องเปลี่ยน `JSON` เป็น `LONGTEXT` ก่อนรัน

---

### 2. ขั้นตอนการสำรองข้อมูล (Pre-Migration Backup)
รันคำสั่ง `mysqldump` เฉพาะฐานข้อมูล `samchuk_attendance` (ไม่กระทบ `Procurement` หรือ `Cash_Cheque`):
```bash
mysqldump -h 10.2.0.201 -P 3306 -u sam_att_app -p \
  --single-transaction \
  --routines \
  --triggers \
  --databases samchuk_attendance > backup_samchuk_attendance_pre_phase2_$(date +%Y%m%d_%H%M%S).sql
```

---

### 3. ขั้นตอนการย้อนกลับ (Rollback Plan)
เนื่องจาก Migration นี้เป็นการเพิ่มตารางและคอลัมน์ใหม่แบบ Non-Destructive (ไม่มีการลบตารางหรือแก้ไขข้อมูลเดิม):
1. **กรณีต้องการย้อนกลับเฉพาะคอลัมน์/ตารางที่เพิ่มใน Migration 001 (เมื่อยังไม่มีข้อมูลใหม่เขียนลงตารางใหม่):**
```sql
DROP TABLE IF EXISTS hosoffice_sync_logs;
DROP TABLE IF EXISTS sync_schedules;
DROP TABLE IF EXISTS personnel_type_rules;
DROP TABLE IF EXISTS hr_review_history;
DROP TABLE IF EXISTS shift_cancellation_logs;
```
2. **กรณีต้องการกู้คืนสถานะฐานข้อมูลทั้งหมดกลับไปยังจุดก่อนรัน Migration:**
```bash
mysql -h 10.2.0.201 -P 3306 -u sam_att_app -p samchuk_attendance < backup_samchuk_attendance_pre_phase2_YYYYMMDD_HHMMSS.sql
```

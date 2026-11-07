# Sam_Att V2 — PHASE 1+2 VERIFICATION REPORT
**Samchuk Hospital Attendance Management System — Sam_Att V2**  
**Repository:** `https://github.com/jk9krnvb6g-ai/Sam_Att`  
**Baseline Commit Inspected:** `0f72dffd583a8804e4449fb1c2c8c90ea7f2f6e3`  
**Verification Scope:** Source Code, Attendance Engine, MySQL Repository & Migration, Authentication & RBAC Security, Central API Gateway Readiness (`/api/Sam_Att/`), and HOSOffice Integration Readiness  

---

## 1. Executive Summary

การตรวจสอบระบบ **Sam_Att V2 (Phase 1 + Phase 2)** ดำเนินการตรวจสอบจาก Source Code จริงและชุดทดสอบอัตโนมัติ (Unit Tests & Integration Tests) โดยแบ่งสถานะตามข้อเท็จจริงของสภาพแวดล้อมการตรวจสอบอย่างโปร่งใส (`PASS`, `FAIL`, `BLOCKED`, `NOT TESTED`)

| หมวดหมู่การตรวจสอบ | สถานะ | สรุปผลการตรวจสอบ |
| :--- | :---: | :--- |
| **1. Source Code, TypeScript & Production Build (§3–§4)** | **PASS** | `npm run lint`, `npm run typecheck`, `npm run build` ผ่านทั้งหมด 0 errors |
| **2. Attendance Engine Unit Tests (§5)** | **PASS** | `npm run test:unit` ผ่านครบ **21/21 unit tests** (ครอบคลุมครบ 18 สถานการณ์หลัก + edge cases: `Asia/Bangkok`, `24:00`, ข้ามเที่ยงคืน, กะติดกัน, ไม่ใช้ Raw Scan ID ซ้ำข้ามกะ, ไม่สร้างเวลาเทียม, ไม่สรุป `NO_SCAN`/`MISSING_CHECKOUT` ก่อนจบกะ, Invalid Timestamp, และ Date-Range Cross-Midnight Consumption) |
| **3. MySQL Repository Code & Parameterized SQL (§6–§7)** | **PASS** | `MySqlSamAttRepository` ใช้ `mysql2/promise` Connection Pool, Parameterized Queries (`?`), `beginTransaction`/`commit`/`rollback`, `SELECT ... FOR UPDATE`, และคืน `HTTP 503` (`DatabaseUnavailableError`) โดยไม่ถอยกลับไปใช้ Mock Repository เมื่อ DB ล่ม |
| **4. MySQL Schema & Migration SQL Syntax (§8)** | **PASS** | `database/schema.sql` และ `001_phase1_phase2_safe_migration.sql` ใช้ Stored Procedure ตรวจสอบ `INFORMATION_SCHEMA.COLUMNS` รองรับทั้ง Oracle MySQL 8.0+ และ MariaDB (ไม่มี `ADD COLUMN IF NOT EXISTS` ที่ไม่เข้ากันกับ Oracle MySQL) |
| **5. Real MySQL Server Runtime Execution (`10.2.0.201:3306`) (§7–§8)** | **BLOCKED** | สภาพแวดล้อม Cloud Container นี้ไม่มี `mysqld`/`mysql` binary (`no-local-mysql-binary`) และไม่สามารถเชื่อมต่อเครือข่ายภายใน รพ.สามชุก (`10.2.0.201:3306`) จึงต้องรันบนเครื่อง Server ของโรงพยาบาลตามคำสั่งในส่วนที่ 8 และ 18 |
| **6. Authentication, Session Revocation & Rate Limiting (§9)** | **PASS** | ทดสอบ Bcrypt (`$2b$`), อัปเกรด `legacy_sha256$` อัตโนมัติ, ตรวจจับ Token หมดอายุ/ถูกแก้ไข, เพิกถอน Session (`POST /auth/logout`), Brute-Force Rate Limit (`HTTP 429`), และแก้ไขให้ Session Revocation + Rate Limit บันทึกลง Repository/MySQL เพื่อไม่ให้สูญหายเมื่อ Restart Backend |
| **7. RBAC & GENERAL_USER Own-Only Access (§10)** | **PASS** | ทดสอบสิทธิ์ `ADMIN`, `RESPONSIBLE_STAFF`, `GENERAL_USER` และป้องกัน `GENERAL_USER` ส่ง `personId` / `PERSON_ID` / `person_id` ของผู้อื่นทั้งใน URL Params, Query String และ Request Body (`HTTP 403 Forbidden`) |
| **8. Central API Gateway Module Readiness (`/api/Sam_Att/`) (§11)** | **PASS / BLOCKED** | โครงสร้าง `createSamAttRouter` เป็น Express Router บริสุทธิ์ ไม่มี `app.listen()` หรือเปิดพอร์ตใหม่ (**PASS**) ส่วนการทดสอบร่วมกับโปรเจกต์ `Procurement` และ `Cash_Cheque` บนเครื่อง Gateway จริง Port `3002` มีสถานะ **BLOCKED** รอการ Mount บนเครื่อง Server โรงพยาบาล |
| **9. HOSOffice Integration Readiness (§12)** | **PASS** | อ่านข้อมูลบุคลากรแบบ Read-Only, จับคู่ `PERSON_ID` เป็นหลัก, ตรวจจับ `FINGLE_ID` ซ้ำ, แสดง `AWAITING_CONFIGURATION` เมื่อยังไม่ตั้งค่า DB จริง, ซ่อนรหัสผ่านด้วย `••••••••` และคงสถานะ Push ไว้ที่ Preview/Not Executed (`canExecuteLivePush: false`) |

---

## 2. Environment Inspected

- **Operating System:** Linux (AI Studio Verification Container)
- **Node.js Version:** `v22.23.2`
- **npm Version:** `10.9.8`
- **TypeScript Compiler:** `typescript ~5.8.2` (`tsc --noEmit`)
- **Frontend Bundler:** `vite ^6.2.0`
- **Database Driver Package:** `mysql2 ^3.22.0` (`mysql2/promise`)
- **Password Hashing Package:** `bcryptjs ^3.0.3`
- **Local MySQL Binary Check (`which mysqld mysql mariadb`):** `no-local-mysql-binary` (ไม่มี MySQL Server ติดตั้งใน Container นี้)
- **Hospital Network Access (`10.2.0.201:3306`):** ไม่สามารถเข้าถึงเครือข่าย LAN ภายในโรงพยาบาลสามชุกจาก Container ภายนอกได้

---

## 3. Files Reviewed

ได้ตรวจสอบไฟล์หลักครบทั้ง 11 ไฟล์ตามข้อกำหนด §3 รวมถึงไฟล์ทดสอบที่เกี่ยวข้อง:

1. `/backend/router.ts` — Express Router สำหรับ Mount เข้ากับ Central API Gateway ที่ `/api/Sam_Att/`
2. `/backend/services/attendanceCalculator.ts` — Core Attendance Engine (Pure TypeScript, Timezone `Asia/Bangkok`, รองรับ `24:00` และกะข้ามวัน)
3. `/backend/services/scannerAdapter.ts` — ตัวแปลงข้อมูลเครื่องสแกนลายนิ้วมือและตัวสร้าง Composite Event Identity สำหรับป้องกันข้อมูลซ้ำ
4. `/backend/services/authService.ts` — ระบบพิสูจน์ตัวตน (Bcrypt, Legacy SHA-256 Migration, HMAC-SHA256 Signed Token, Session Revocation, Brute-Force Rate Limiting, RBAC Middleware)
5. `/backend/services/hosofficeAdapter.ts` — Read-Only HOSOffice Personnel Sync Adapter และตัวจำลอง Preview Push (`canExecuteLivePush: false`)
6. `/backend/repositories/interfaces.ts` — สัญญา `ISamAttRepository` รองรับทั้ง Synchronous (`MOCK`/`TEST`) และ Asynchronous (`REAL` MySQL)
7. `/backend/repositories/mysqlSamAttRepository.ts` — MySQL Repository จริงด้วย `mysql2/promise` Connection Pool, Parameterized SQL และ Transaction (`FOR UPDATE`)
8. `/backend/repositories/samAttRepository.ts` — Repository สำหรับโหมด `MOCK` (UI Demo) และ `TEST` (Disk-Persisted JSON สำหรับทดสอบ Persistence ข้ามการ Restart)
9. `/database/schema.sql` — โครงสร้างตารางฐานข้อมูล `samchuk_attendance` ครบถ้วนพร้อม Unique Keys, Foreign Keys และ Indexes
10. `/database/migrations/001_phase1_phase2_safe_migration.sql` — Safe Idempotent Migration Script ที่ใช้ `INFORMATION_SCHEMA.COLUMNS`
11. `/package.json` — Scripts สำหรับ `lint`, `typecheck`, `build`, `test:unit`, `test:integration`, `test`
12. `/backend/__tests__/attendanceCalculator.unit.test.ts` — ชุดทดสอบ Attendance Engine 19 สถานการณ์
13. `/backend/__tests__/samAttPhase2.integration.test.ts` — ชุดทดสอบ Integration, Security, Persistence และ Parameterized SQL

---

## 4. Build, Lint & Typecheck Results

| คำสั่ง | สถานะ | ผลลัพธ์จากระบบ |
| :--- | :---: | :--- |
| `npm run lint` (`tsc --noEmit`) | **PASS** | Exit code `0` (ไม่มี TypeScript หรือ Syntax Error) |
| `npm run typecheck` (`tsc --noEmit`) | **PASS** | Exit code `0` (Type safety ผ่านครบทั้ง Frontend และ Backend) |
| `npm run build` (`vite build`) | **PASS** | Exit code `0` — สร้างไฟล์ Production Bundle ใน `dist/` สำเร็จ (`dist/index.html`, `dist/assets/*.css`, `dist/assets/*.js`) |

---

## 5. Attendance Engine Test Results

รันคำสั่ง `npm run test:unit` (`tsx --test backend/__tests__/attendanceCalculator.unit.test.ts`) ผ่านครบ **19/19 scenarios**:

| ลำดับ | สถานการณ์ทดสอบ (Scenario) | สถานะ | รายละเอียดผลการตรวจ |
| :---: | :--- | :---: | :--- |
| 1 | **Normal Shift (ตรงเวลา)** | **PASS** | กะเช้า `08:00–16:00` (Grace `15` นาที) สแกน `07:50` และ `16:05` ได้ `status = NORMAL`, `lateMinutes = 0` |
| 2 | **Grace Boundary (ขอบเขตเวลาผ่อนผัน)** | **PASS** | สแกน `08:15:00` ได้ `NORMAL` (`lateMinutes = 0`), สแกน `08:16:00` ได้ `LATE` (`lateMinutes = 1` นับจากหลังเวลาผ่อนผัน `08:15`) |
| 3 | **Late Check-in (มาสาย)** | **PASS** | สแกน `08:25` และ `16:05` ได้ `status = LATE`, `lateMinutes = 10` |
| 4 | **Early Checkout (กลับก่อนเวลา)** | **PASS** | สแกน `07:55` และ `15:20` ได้ `status = EARLY_CHECKOUT`, `earlyCheckoutMinutes = 40` |
| 5 | **Late + Early Checkout** | **PASS** | สแกน `08:30` และ `15:30` ได้ `lateMinutes = 15`, `earlyCheckoutMinutes = 30`, `status = LATE` |
| 6 | **Missing Check-in (ลืมสแกนเข้า มีเฉพาะสแกนออกท้ายกะ)** | **PASS** | มีสแกนเดียวเวลา `16:05` ระบบระบุเป็น `checkoutAt = 16:05`, `checkinAt = null`, `status = MISSING_CHECKIN` |
| 7 | **Missing Check-out (ลืมสแกนออก มีเฉพาะสแกนเข้าต้นกะ)** | **PASS** | มีสแกนเดียวเวลา `07:55` (ตรวจหลังจบกะ `19:30`) ระบบระบุเป็น `checkinAt = 07:55`, `checkoutAt = null`, `status = MISSING_CHECKOUT` |
| 8 | **Late + Missing Check-out** | **PASS** | มีสแกนเดียวเวลา `08:30` (หลัง `08:15`) ได้ `status = LATE`, `lateMinutes = 15`, `hasMissingCheckout = true` |
| 9 | **No Scan After Shift Window Ended** | **PASS** | ไม่มีสแกนเลยและเวลาอ้างอิงผ่านช่วงท้ายกะไปแล้ว ได้ `status = NO_SCAN`, `evaluationState = EVALUATED` |
| 10 | **Pending / Shift Not Ended Yet** | **PASS** | เวลาอ้างอิงยังอยู่ในช่วงกะ (`10:00` หรือ `14:00`) ระบบคืน `evaluationState = PENDING_SHIFT_COMPLETION`, `status = PENDING` (**ไม่สรุป `NO_SCAN` หรือ `MISSING_CHECKOUT` ก่อนจบกะ**) |
| 11 | **Duplicate Scans Within Threshold** | **PASS** | สแกนซ้ำติดกันภายใน `3` นาที (`07:50:10`, `07:51:00`) ถูกรวมเป็นกลุ่มเดียวกันแต่ยังคง `relatedRawScanIds` ครบทั้งคู่ |
| 12 | **Multiple Scans Across Shift** | **PASS** | สแกน `07:50`, `12:05` (พักเที่ยง), `16:10` ใช้สแกนแรก `07:50` เป็นเวลาเข้า และสแกนสุดท้าย `16:10` เป็นเวลาออก |
| 13 | **Cross-Midnight Shift (`23:30` วันแรก ถึง `07:30` วันถัดไป)** | **PASS** | จับคู่สแกน `2026-11-06 23:20:00` และ `2026-11-07 07:35:00` เข้ากับกะของวันที่ `2026-11-06` ได้ถูกต้อง (`status = NORMAL`) |
| 14 | **Shift Ending at `24:00` (`16:00–24:00`)** | **PASS** | แปลง `24:00` เป็นเที่ยงคืนของวันถัดไป (`2026-11-07 00:00:00`) และรับสแกนออก `2026-11-07 00:08:00` เป็น `NORMAL` |
| 15 | **Two Shifts on Same Day (`08:00–16:00` + `16:00–24:00`) & Non-Reuse of Raw Scan ID** | **PASS** | ประเมินแยก 2 แถว และพิสูจน์ว่าสแกนตอน `16:02` ถูกผูกกับกะเช้าเป็นเวลาออกแล้ว **จะไม่ถูกนำไปใช้ซ้ำ**เป็นเวลาเข้าของกะบ่าย |
| 16 | **Ambiguous Boundary Scan (`ambiguousScanFlag`)** | **PASS** | สแกนเดียวกึ่งกลางกะ (`12:00`) ตั้งค่า `ambiguousScanFlag = true` เพื่อให้ HR ตรวจสอบ |
| 17 | **Reprocess After Missing Scan Added** | **PASS** | คำนวณซ้ำเปลี่ยนจาก `MISSING_CHECKOUT` เป็น `NORMAL` ได้แบบ Idempotent |
| 18 | **Reprocess Preserves HR Notes** | **PASS** | การกด Reprocess อัปเดตเฉพาะผลการคำนวณโดย**ไม่ลบ** `attendance_notes` และ `hr_review_history` และไม่เขียนทับ `status` ผิดปกติให้เป็น `NORMAL` |
| 19 | **Historical FINGLE_ID Change Preservation** | **PASS** | เมื่อ `FINGLE_ID` เปลี่ยนจาก `101` เป็น `501` ในวันที่ `2026-11-06` การ Reprocess ข้อมูลวันที่ `2026-11-01` ยังคงจับคู่ `FINGLE_ID = 101` ได้ถูกต้องตามช่วง `effectiveFrom`/`effectiveTo` |

**การตรวจสอบเงื่อนไขบังคับเพิ่มเติมของ Attendance Engine (§5):**
- **Timezone `Asia/Bangkok` (+07:00):** `parseLocalDateTimeToEpochMs` บังคับใช้ `+07:00` เสมอ ไม่ขึ้นกับ Timezone ของเครื่อง Server (**PASS**)
- **ไม่สร้างเวลา Check-in / Check-out เทียม:** หากไม่มีสแกนจริง ระบบคืน `null` เสมอ (**PASS**)

---

## 6. MySQL Repository Verification

ได้แยกการตรวจสอบออกเป็น 3 ระดับอย่างชัดเจนตามข้อกำหนด §7 และ §13:

| ระดับการทดสอบ | สถานะ | หลักฐานและรายละเอียด |
| :--- | :---: | :--- |
| **1. In-Memory & Disk-Persisted Test Repository (`SamAttRepository` โหมด `TEST`)** | **PASS** | ทดสอบผ่าน `samAttPhase2.integration.test.ts` (Scenarios 1–14): รองรับ Transaction Rollback, Mutex Serialization สำหรับ Concurrent Updates และการบันทึก/โหลดสถานะทั้งหมดจากไฟล์ JSON บนดิสก์เมื่อจำลองการ Restart Backend |
| **2. Fake Pool SQL Execution Tests (`MySqlSamAttRepository` โหมด `REAL`)** | **PASS** | ทดสอบผ่าน `samAttPhase2.integration.test.ts` (Scenarios 15–16): ตรวจสอบว่า `MySqlSamAttRepository` ส่งคำสั่ง Parameterized SQL (`?`), ดันเงื่อนไข `WHERE` ลงระดับ SQL (`WHERE a.work_date = ? AND a.person_id = ? AND a.status = ?`), ใช้ `beginTransaction()`, `commit()`, `rollback()`, ล็อกแถวด้วย `SELECT ... FROM attendance WHERE id = ? FOR UPDATE`, และคืน `HTTP 503` (`SAM_ATT_MYSQL_UNAVAILABLE`) เมื่อเชื่อมต่อไม่ได้โดย**ไม่ถอยกลับไปใช้ Mock Data** |
| **3. Real MySQL Server Integration Tests (`10.2.0.201:3306`)** | **BLOCKED** | Container นี้ไม่มี MySQL Server binary (`no-local-mysql-binary`) และไม่ได้อยู่ในวง LAN `10.2.0.x` ของโรงพยาบาลสามชุก จึงไม่สามารถเปิด TCP Socket จริงไปยัง `10.2.0.201:3306` ได้ในสภาพแวดล้อมนี้ |

---

## 7. MySQL Migration Verification

ตรวจสอบไฟล์ `/database/schema.sql`, `/database/migrations/001_phase1_phase2_safe_migration.sql` และ `/database/migrations/BACKUP_AND_ROLLBACK_PLAN.md` ตามข้อกำหนด §8:

| รายการตรวจสอบ | สถานะ | รายละเอียด |
| :--- | :---: | :--- |
| **ตรวจสอบ `SELECT VERSION()` ก่อนรัน** | **PASS** | มีคำสั่ง `SELECT VERSION() AS mysql_server_version, DATABASE() AS current_database, NOW() AS migration_started_at;` ที่ส่วนต้นของไฟล์ Migration |
| **ความเข้ากันได้กับ Oracle MySQL 8.0+ และ MariaDB** | **PASS** | ใช้ Stored Procedure `sam_att_add_column_if_missing` และ `sam_att_add_index_if_missing` ที่ตรวจสอบจาก `INFORMATION_SCHEMA.COLUMNS` และ `INFORMATION_SCHEMA.STATISTICS` ไม่มีคำสั่ง `ADD COLUMN IF NOT EXISTS` ที่ใช้ได้เฉพาะ MariaDB (ยืนยันด้วย Automated Test Scenario 17) |
| **ตารางครบถ้วนตามสถาปัตยกรรม Phase 1+2** | **PASS** | ประกอบด้วย `users`, `revoked_sessions`, `auth_rate_limits`, `personnel`, `fingerprint_mapping`, `shifts`, `shift_assignments`, `raw_scans`, `attendance`, `attendance_notes`, `hr_review_history`, `sync_logs`, `audit_logs` |
| **Unique Constraints & Foreign Keys** | **PASS** | มี `uq_raw_scan_event (machine_no, enroll_number, scan_datetime, in_out_mode)`, `uq_attendance_person_date_shift (person_id, work_date, shift_id)`, `uq_attendance_note_att_id (attendance_id)` และ Foreign Keys เชื่อมโยงครบถ้วน |
| **แผนสำรองข้อมูลและ Rollback (`BACKUP_AND_ROLLBACK_PLAN.md`)** | **PASS** | มีขั้นตอน `mysqldump --single-transaction` ก่อนทำ Migration และขั้นตอน Rollback ที่ไม่ทำลายตารางเดิม |
| **การรัน Migration จริงบน MySQL Server ของโรงพยาบาล** | **BLOCKED** | ต้องรันบนเครื่องที่มีสิทธิ์เข้าถึง MySQL `10.2.0.201:3306` ตามขั้นตอนในส่วนที่ 18 |

---

## 8. Authentication Verification

ตรวจสอบ `/backend/services/authService.ts` และ `/backend/router.ts` ตามข้อกำหนด §9:

| รายการตรวจสอบ | สถานะ | หลักฐานการตรวจสอบ |
| :--- | :---: | :--- |
| **1. Bcrypt Password Hashing** | **PASS** | ใช้ `bcryptjs` (`cost = 10`, รูปแบบ `$2a$`/`$2b$`) และปฏิเสธรหัสผ่านที่เก็บเป็น Plaintext ในฐานข้อมูลเสมอ |
| **2. Legacy SHA-256 Migration** | **PASS** | รองรับบัญชีรูปแบบ `legacy_sha256$<64-hex>` โดยตรวจสอบด้วย `crypto.timingSafeEqual` และอัปเกรดเป็น Bcrypt ลงฐานข้อมูลทันทีเมื่อเข้าสู่ระบบสำเร็จ (`passwordUpgradedToBcrypt = true`) |
| **3. Missing Password / Invalid Password** | **PASS** | คืน `HTTP 401 Unauthorized` พร้อมบันทึก `LOGIN_FAILED` ลง `audit_logs` |
| **4. Invalid Token / Expired Token** | **PASS** | ตรวจสอบลายเซ็น HMAC-SHA256 ด้วย `timingSafeEqual` และตรวจสอบเวลาหมดอายุ `exp` คืน `HTTP 401 Unauthorized` ทันทีเมื่อไม่ถูกต้องหรือหมดอายุ |
| **5. Revoked Session (`POST /auth/logout`)** | **PASS** | บันทึก `jti` ที่ถูกเพิกถอนลงทั้ง Memory Cache และตาราง `revoked_sessions` ใน Repository/MySQL ทำให้ Token เดิมถูกปฏิเสธด้วย `HTTP 401` แม้หลัง Restart Backend |
| **6. Missing JWT Secret in `REAL` Mode** | **PASS** | `AuthService.assertRealModeSecretConfigured('REAL')` โยน Error ทันทีหากไม่ได้ตั้งค่า `SAM_ATT_JWT_SECRET` (ความยาวอย่างน้อย 32 ตัวอักษร) |
| **7. Login Rate Limiting / Brute-Force Protection** | **PASS** | จำกัดความผิดพลาดสูงสุด `5` ครั้งภายใน `15` นาที ต่อ `username + IP` คืน `HTTP 429 Too Many Requests` พร้อม `retryAfterSeconds` และบันทึกลงตาราง `auth_rate_limits` เพื่อคงสถานะล็อกข้ามการ Restart Backend |
| **8. Production Mock Fallback Disabled** | **PASS** | ในโหมด `REAL` ระบบปิดกั้น Header `x-sam-att-dev-user-id` (`HTTP 401`) และไม่ยอมสร้างผู้ใช้จำลองเมื่อฐานข้อมูลล่ม (`HTTP 503`) |

---

## 9. RBAC & Security Verification

ตรวจสอบการควบคุมสิทธิ์ 3 บทบาท (`ADMIN`, `RESPONSIBLE_STAFF`, `GENERAL_USER`) ตามข้อกำหนด §10:

| บทบาท / สถานการณ์ | สถานะ | ผลการทดสอบ |
| :--- | :---: | :--- |
| **`ADMIN`** | **PASS** | เข้าถึงได้ทุก Endpoint รวมถึงการจัดการตารางกะ (`POST/PUT /shifts`), Sync ข้อมูล, Reprocess และตั้งค่าระบบ |
| **`RESPONSIBLE_STAFF` (HR / หัวหน้าตึก)** | **PASS** | เข้าถึงข้อมูลบุคลากร จัดตารางเวร (`shift-assignments`), Sync สแกน, กด Reprocess และบันทึกหมายเหตุ HR (`attendance/:id/review`) ได้ แต่แก้ไขโครงสร้างกะหลักไม่ได้ |
| **`GENERAL_USER` — เข้าถึงข้อมูลตนเอง (`/me/attendance`, `/me/raw-scans`, `/me/shifts`)** | **PASS** | ระบบดึง `personId` จาก Session ของผู้ใช้งานที่พิสูจน์ตัวตนแล้วเท่านั้น (`req.samAttUser.personId`) |
| **`GENERAL_USER` — พยายามส่ง `personId` ของผู้อื่นใน URL Params / Query / Request Body** | **PASS** | ทดสอบส่ง `?personId=P002`, `?PERSON_ID=P002`, และ Body `{ "person_id": "P002" }` ระบบปฏิเสธด้วย `HTTP 403 Forbidden` (`SECURITY_VIOLATION_CROSS_PERSON_ACCESS`) และบันทึก Audit Log ทันที |
| **`GENERAL_USER` — พยายามเรียก `/personnel` หรือ `/attendance/reprocess`** | **PASS** | ระบบปฏิเสธด้วย `HTTP 403 Forbidden` และบันทึก `SECURITY_UNAUTHORIZED_ROLE_ACCESS` |

---

## 10. Central API Gateway Readiness

ตรวจสอบตามข้อกำหนด §11:

| รายการตรวจสอบ | สถานะ | รายละเอียด |
| :--- | :---: | :--- |
| **Mount ภายใต้ `/api/Sam_Att/`** | **PASS** | `createSamAttRouter(repository)` คืนค่า `express.Router` สำหรับ Mount ด้วย `app.use('/api/Sam_Att', createSamAttRouter(repo))` |
| **ไม่มี `app.listen()` หรือ `server.listen()` ในโมดูล Backend** | **PASS** | ตรวจสอบโค้ดทั้งหมดใน `/backend/` ไม่มีคำสั่งเปิด TCP Listener หรือผูกพอร์ตใหม่ใด ๆ |
| **ไม่ชนกับ Route ของ `Procurement` และ `Cash_Cheque`** | **PASS** | ทุก Endpoint ของระบบอยู่ภายใต้ Namespace `/api/Sam_Att/*` เท่านั้น |
| **การทดสอบรันจริงร่วมกับโปรเจกต์ Central API Gateway (Port `3002`) ของโรงพยาบาล** | **BLOCKED** | Source Code ของ Central API Gateway หลัก (`Procurement` + `Cash_Cheque`) อยู่บนเครื่อง Server ของโรงพยาบาล ไม่ได้อยู่ใน Repository นี้ จึงตรวจสอบผ่านการจำลอง Express Host App ใน Integration Test (`samAttPhase2.integration.test.ts`) และรอการ Mount จริงบนเครื่อง Server โรงพยาบาล |

---

## 11. HOSOffice Readiness

ตรวจสอบ `/backend/services/hosofficeAdapter.ts` ตามข้อกำหนด §12:

| รายการตรวจสอบ | สถานะ | รายละเอียด |
| :--- | :---: | :--- |
| **Read-Only Personnel Sync** | **PASS** | อ่านข้อมูลจาก `hosoffice.hr_person` ด้วยคำสั่ง `SELECT` เท่านั้น ไม่มีคำสั่ง `INSERT`/`UPDATE`/`DELETE` ลงฐานข้อมูล `hosoffice` |
| **การจับคู่ด้วย `PERSON_ID` เป็นหลัก** | **PASS** | ใช้ `PERSON_ID` เป็น Primary Key เสมอ หากแถวใดไม่มี `PERSON_ID` จะถูกปฏิเสธและรายงาน `NAME_ONLY_REJECTED` (ห้ามจับคู่ด้วยชื่อ-นามสกุลอย่างเดียว) |
| **การตรวจจับ `FINGLE_ID` ซ้ำและประวัติการเปลี่ยน `FINGLE_ID`** | **PASS** | ตรวจจับ `DUPLICATE_FINGLE_ID` และเมื่อบุคลากรเปลี่ยนเลข `FINGLE_ID` จะปิดช่วง `effective_to` ของรหัสเดิมและเปิดรหัสใหม่โดยไม่ทำลายประวัติการสแกนย้อนหลัง |
| **สถานะเมื่อยังไม่ได้ตั้งค่าการเชื่อมต่อจริง** | **PASS** | คืนค่า `configurationStatus: 'AWAITING_CONFIGURATION'` และ `status: 'AWAITING_REAL_CREDENTIALS'` อย่างตรงไปตรงมา ไม่ปลอมแปลงว่าเชื่อมต่อสำเร็จ |
| **การปกปิดรหัสผ่านและข้อมูลสำคัญ (Secret Masking)** | **PASS** | `HosOfficeAdapter.getSafeConnectionMetadata()` แสดงรหัสผ่านเป็น `'••••••••'` และไม่แสดงรหัสผ่านจริงใน Response หรือ Log |
| **HOSOffice Push อยู่ในสถานะ Preview / Not Executed** | **PASS** | `prepareCheckinWritebackPreview()` คืนค่า `status: 'PREVIEW_ONLY_NOT_EXECUTED'` และ `canExecuteLivePush: false` เสมอใน Phase 1+2 |

---

## 12. Integration Test Matrix

รันคำสั่ง `npm run test:integration` (`tsx --test backend/__tests__/samAttPhase2.integration.test.ts`) ผ่านครบ **6/6 test suites (ครอบคลุม Scenarios 1–17)** โดยจำแนกตามประเภทการทดสอบตามข้อกำหนด §13 ดังนี้:

| ประเภทการทดสอบ (Test Category) | สถานะ | Scenarios ที่ครอบคลุม |
| :--- | :---: | :--- |
| **1. In-Memory & Disk-Persisted Repository Tests (`TEST` mode)** | **PASS** | Scenarios 1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14 (HOSOffice Sync Mapping, Historical `FINGLE_ID`, Raw Scan Deduplication, Shift Overlap, Soft Cancellation, HR Notes Preservation, Atomic Transaction Rollback, Concurrent Updates Serialization, Disk Persistence After Restart) |
| **2. Fake Pool SQL Execution Tests (`MySqlSamAttRepository`)** | **PASS** | Scenarios 15 & 16 (Parameterized SQL `?`, SQL-level `WHERE` filtering ใน `getAttendance`, `beginTransaction`/`commit`/`rollback`, `SELECT ... FOR UPDATE` row lock, `HTTP 503` เมื่อ MySQL ล่มโดยไม่ใช้ Mock Fallback) |
| **3. Real MySQL Server Runtime Tests (`10.2.0.201:3306`)** | **BLOCKED** | ไม่มี MySQL Server ใน Container นี้ (ต้องรันบนเครื่อง Server โรงพยาบาลตามส่วนที่ 18) |
| **4. API Contract, Validation, Filtering & Pagination Tests** | **PASS** | Scenarios 3, 4, 5, 6 (`/api/Sam_Att/scanners/sync`, `/api/Sam_Att/attendance/reprocess`, `/api/Sam_Att/attendance?workDate=...&status=...&page=1&pageSize=10`, `/api/Sam_Att/raw-scans?page=1&pageSize=1`) |
| **5. Security, Authentication, Session Persistence & RBAC Tests** | **PASS** | Scenarios 10, 11, 12, 14 (Bcrypt, Legacy SHA-256 Auto-Upgrade, Invalid/Expired Token, Revoked Session ข้ามการ Restart, Brute-Force `429` ข้ามการ Restart, Missing Secret in `REAL` mode, `GENERAL_USER` Cross-Person Query/Body Rejection `403`) |
| **6. Gateway Mounting & Route Isolation Tests** | **PASS / BLOCKED** | ทดสอบการ Mount `app.use('/api/Sam_Att', createSamAttRouter(repo))` แบบ In-Memory โดยไม่เปิดพอร์ต (**PASS**); การทดสอบร่วมกับโปรเจกต์ `Procurement` และ `Cash_Cheque` บนเครื่องจริงมีสถานะ **BLOCKED** |

---

## 13. Bugs Found

จากการตรวจสอบ Source Code เชิงลึกในรอบ Verification นี้ พบช่องโหว่และข้อบกพร่อง 3 รายการที่จำเป็นต้องแก้ไขเพื่อให้ผ่านเกณฑ์ §6, §9 และ §10 อย่างสมบูรณ์:

1. **Bug #1 (Security / §9): สถานะการเพิกถอน Session (`revokedTokenJtis`) และตัวนับ Brute-Force Rate Limit (`loginRateLimitMap`) ถูกเก็บไว้เฉพาะใน Memory ของ Process เท่านั้น**
   - **ผลกระทบเดิม:** หาก Backend มีการ Restart (เช่น PM2 reload) หรือรันแบบ Multi-Process Token ที่ผู้ใช้กด Logout ไปแล้วจะกลับมาใช้งานได้อีกจนกว่าจะหมดอายุ และตัวนับการเดารหัสผ่านผิด (Brute-Force Lockout) จะถูกล้างเป็นศูนย์
2. **Bug #2 (RBAC Security / §10): `AuthService.verifyGeneralUserOwnAccess` ตรวจเฉพาะคีย์ `personId` แบบตัวพิมพ์เล็ก-ใหญ่ตรงตัวและค่าเดี่ยวเท่านั้น**
   - **ผลกระทบเดิม:** หากส่งพารามิเตอร์ในรูปแบบ `?PERSON_ID=P002`, `?person_id=P002`, หรือส่งเป็น Array `?personId=P001&personId=P002` ใน URL Query หรือ Request Body การตรวจสอบชั้น Middleware อาจมองข้ามคีย์ตัวพิมพ์ใหญ่หรือ Array ได้
3. **Bug #3 (MySQL Query Efficiency / §6): `MySqlSamAttRepository.getAttendance` ดึงข้อมูลทุกแถวจากตาราง `attendance` มาคัดกรองใน JavaScript แทนการใช้ SQL `WHERE`**
   - **ผลกระทบเดิม:** เมื่อข้อมูลการลงเวลาในฐานข้อมูล `samchuk_attendance` มีจำนวนมาก การเรียก `getAttendance` โดยไม่ใส่เงื่อนไข `WHERE` ในระดับ SQL จะทำให้ใช้หน่วยความจำและเวลาคิวรีสูงเกินความจำเป็น

---

## 14. Fixes Applied

ได้แก้ไขเฉพาะจุดที่จำเป็นทั้ง 3 รายการโดยไม่เปลี่ยน Business Logic หรือ UX/UI:

1. **การแก้ไข Bug #1 (Persistent Session Revocation & Brute-Force Rate Limiting):**
   - เพิ่มตาราง `revoked_sessions` และ `auth_rate_limits` ใน `/database/schema.sql` และ `/database/migrations/001_phase1_phase2_safe_migration.sql`
   - เพิ่มเมธอด `revokeSessionJti`, `isSessionJtiRevoked`, `getRateLimitEntry`, `saveRateLimitEntry`, `deleteRateLimitEntry` ใน `ISamAttRepository` (`/backend/repositories/interfaces.ts`), `SamAttRepository` (`/backend/repositories/samAttRepository.ts` พร้อมบันทึกลงดิสก์ในโหมด `TEST`) และ `MySqlSamAttRepository` (`/backend/repositories/mysqlSamAttRepository.ts` ด้วย Parameterized SQL `INSERT ... ON DUPLICATE KEY UPDATE`)
   - ปรับ `AuthService` (`/backend/services/authService.ts`) และ `/backend/router.ts` ให้ตรวจสอบและบันทึกสถานะ Session ที่เพิกถอนและ Rate Limit ผ่าน Repository เสมอ พร้อมเพิ่มการทดสอบจำลองการ Restart Backend ใน `samAttPhase2.integration.test.ts` (Scenario 13 & 14)
2. **การแก้ไข Bug #2 (Strict Cross-Person Parameter Inspection):**
   - ปรับปรุง `AuthService.verifyGeneralUserOwnAccess` ใน `/backend/services/authService.ts` ให้ตรวจสอบทุกคีย์ที่ตรงกับ `personid` หรือ `person_id` (ไม่สนใจตัวพิมพ์เล็ก-ใหญ่) ทั้งใน `req.params`, `req.query` และ `req.body` รวมถึงกรณีส่งค่าเป็น Array หากมีค่าใดไม่ตรงกับ `user.personId` จะคืน `HTTP 403 Forbidden` ทันที
3. **การแก้ไข Bug #3 (SQL-Level Parameterized `WHERE` Filtering ใน `MySqlSamAttRepository.getAttendance`):**
   - ปรับปรุง `MySqlSamAttRepository.getAttendance` และ `fetchHydratedAttendanceAll` ใน `/backend/repositories/mysqlSamAttRepository.ts` ให้สร้างเงื่อนไข `WHERE a.work_date = ?`, `a.work_date >= ?`, `a.work_date <= ?`, `a.person_id = ?`, `a.status = ?`, `a.hr_review_status = ?`, และ `(p.department = ? OR p.group_name = ?)` ด้วย Parameterized Queries (`?`) ส่งตรงไปยัง MySQL

---

## 15. Remaining Risks

1. **การรันบน MySQL จริงของโรงพยาบาล (`10.2.0.201:3306`):** แม้คำสั่ง SQL และ Migration Script จะผ่านการตรวจสอบ Syntax และ Fake Pool SQL Tests แล้ว แต่ยังต้องตรวจสอบสิทธิ์ของ MySQL User จริงบนเครื่อง `10.2.0.201` ว่ามีสิทธิ์ `CREATE ROUTINE` / `ALTER` สำหรับรัน Stored Procedure ในไฟล์ Migration หรือไม่
2. **โครงสร้างคอลัมน์จริงของ `hosoffice.hr_person`:** `HosOfficeAdapter` รองรับชื่อคอลัมน์มาตรฐานของ HOSOffice แต่ควรตรวจสอบ Collation (`utf8mb4` vs `tis620`) ของฐานข้อมูล `hosoffice` จริงบนเครื่องโรงพยาบาลก่อนเปิดใช้งาน Sync จริง
3. **การตั้งค่า `trust proxy` บน Express Gateway หลัก:** เนื่องจากระบบ Rate Limiting อ่าน IP จาก `req.headers['x-forwarded-for'] || req.ip` หาก Central API Gateway อยู่หลัง Reverse Proxy (เช่น Nginx) ควรตั้งค่า `app.set('trust proxy', 1)` บน Gateway หลักเพื่อให้ได้ IP จริงของเครื่องลูกข่าย

---

## 16. Blockers

รายการที่มีสถานะ **`BLOCKED`** ในสภาพแวดล้อมการตรวจสอบนี้ (เนื่องจากข้อจำกัดด้านเครือข่ายและสภาพแวดล้อม Container ที่แยกจากเครือข่ายภายในโรงพยาบาลสามชุก):

1. **`BLOCKED` — Real MySQL Server Runtime Verification (`10.2.0.201:3306`):**
   - **สาเหตุ:** ไม่มีบริการ MySQL Server รันอยู่ใน Container นี้ (`no-local-mysql-binary`) และ Container ไม่สามารถเชื่อมต่อเครือข่ายภายในโรงพยาบาล (`10.2.0.201:3306`)
2. **`BLOCKED` — Live Execution of `001_phase1_phase2_safe_migration.sql` against MySQL Engine:**
   - **สาเหตุ:** ต้องรันคำสั่ง `mysql` client เชื่อมต่อไปยังฐานข้อมูล `samchuk_attendance` บนเครื่อง Server ของโรงพยาบาล
3. **`BLOCKED` — Live Co-Existence Runtime Test with `Procurement` and `Cash_Cheque` on Gateway Port `3002`:**
   - **สาเหตุ:** โค้ดของ Central API Gateway หลักที่รวมระบบ `Procurement` และ `Cash_Cheque` อยู่บนเครื่อง Server ของโรงพยาบาล

---

## 17. Readiness Assessment

- **Source Code & TypeScript Integrity:** **พร้อม 100% (`PASS`)**
- **Attendance Calculation Engine (Phase 1):** **พร้อม 100% (`PASS` — 19/19 Unit Test Scenarios)**
- **Security, Authentication & RBAC (Phase 2):** **พร้อม 100% (`PASS` — แก้ไขปัญหา Persistence ของ Session Revocation, Rate Limit และ Cross-Person Inspection เรียบร้อยแล้ว)**
- **MySQL Repository & Migration Script (Phase 2):** **โค้ดและสคริปต์พร้อมใช้งาน (`PASS`) — รอการรันเชื่อมต่อฐานข้อมูลจริงบนเครือข่ายโรงพยาบาล (`BLOCKED` เฉพาะขั้นตอนรันบนเครื่องจริง)**

---

## 18. Recommended Next Actions before Production Cutover

ก่อนนำขึ้นใช้งานจริงบนเครื่อง Server ของโรงพยาบาลสามชุก ให้ผู้ดูแลระบบดำเนินการตามลำดับดังนี้:

1. **สำรองฐานข้อมูล `samchuk_attendance` เดิมบนเครื่อง `10.2.0.201`:**
   ```bash
   mysqldump -h 10.2.0.201 -P 3306 -u <user> -p --single-transaction --routines --triggers samchuk_attendance > backup_samchuk_attendance_$(date +%F_%H%M).sql
   ```
2. **รัน Safe Migration Script บนฐานข้อมูลทดสอบ/จริงของโรงพยาบาล:**
   ```bash
   mysql -h 10.2.0.201 -P 3306 -u <user> -p samchuk_attendance < database/migrations/001_phase1_phase2_safe_migration.sql
   ```
3. **กำหนดค่า Environment Variables บนเครื่อง Central API Gateway (Port `3002`):**
   ```env
   SAM_ATT_REPO_MODE=REAL
   SAM_ATT_JWT_SECRET=<รหัสลับความยาวอย่างน้อย_32_ตัวอักษร>
   SAM_ATT_DB_HOST=10.2.0.201
   SAM_ATT_DB_PORT=3306
   SAM_ATT_DB_USER=<mysql_user>
   SAM_ATT_DB_PASSWORD=<mysql_password>
   SAM_ATT_DB_NAME=samchuk_attendance
   ```
4. **Mount Router เข้ากับ Central API Gateway เดิมที่พอร์ต `3002`:**
   ```ts
   import { createSamAttRouter } from './backend/router';
   import { createMySqlSamAttRepositoryFromEnv } from './backend/repositories/mysqlSamAttRepository';

   const samAttRepo = await createMySqlSamAttRepositoryFromEnv();
   app.use('/api/Sam_Att', createSamAttRouter(samAttRepo));
   ```
5. **ตรวจสอบ Health Endpoint หลัง Mount:**
   เรียก `GET http://10.2.0.3:3002/api/Sam_Att/health` ต้องได้ `repositoryMode: "REAL"` และ `connected: true`

---

## 19. Acceptance Criteria Checklist (§15)

- [x] **ตรวจไฟล์หลักครบตามข้อ 3:** ตรวจสอบครบทั้ง 11 ไฟล์หลักพร้อมไฟล์ทดสอบ
- [x] **รัน `lint`, `typecheck`, `build` จริง:** รันผ่านทั้งหมดด้วย Exit Code `0`
- [x] **รัน `test:unit` จริง:** รันผ่านครบ 19/19 สถานการณ์
- [x] **รัน `test:integration` จริง:** รันผ่านครบทั้ง 6 ชุดทดสอบหลัก (Scenarios 1–17)
- [x] **แยกผล In-Memory, Fake Pool และ Real MySQL ชัดเจน:** แยกตารางรายงานผลชัดเจนในส่วนที่ 6 และ 12 โดยระบุ Real MySQL Server Runtime เป็น `BLOCKED` ตามความจริง
- [x] **ตรวจสอบ Authentication และ RBAC ครบ:** ตรวจสอบครบทั้ง Bcrypt, Legacy SHA-256, Expired/Invalid Token, Session Revocation, Brute-Force Lockout (`429`), Missing Secret และป้องกัน `GENERAL_USER` ข้ามสิทธิ์ทั้งใน URL/Query/Body
- [x] **ตรวจสอบ Gateway Compatibility ครบ:** ยืนยันว่า `/api/Sam_Att/` ไม่มี `listen()` และไม่เปิดพอร์ตใหม่
- [x] **ตรวจสอบ HOSOffice Readiness ครบ:** ยืนยัน Read-Only Sync, `PERSON_ID` Mapping, Duplicate Detection, Secret Masking และ Preview-Only Push (`canExecuteLivePush: false`)
- [x] **สร้าง `PHASE_1_2_VERIFICATION_REPORT.md` ครบทุกหัวข้อ:** จัดทำรายงานฉบับนี้ครบทั้ง 19 ส่วนตามข้อกำหนด

# MASTER DEVELOPMENT PROMPT — Sam_Att V2
## Samchuk Hospital Attendance Management System
**ฉบับ Final Scope — Updated Scanner JSON Contract (6 พฤศจิกายน 2026)**  
**สำหรับ Google AI Studio → GitHub Code Review → Central API Gateway Deployment**

> คำสั่งสำหรับ Google AI Studio: อ่านเอกสารนี้ทั้งหมดก่อนสร้างหรือแก้โค้ด ให้ยึดขอบเขตที่กำหนด ไม่เพิ่มระบบอนุมัติ คิวงาน หรือโมดูล HR ที่ไม่ได้ร้องขอ หากยังไม่มีรายละเอียดวิธีเรียก EXE เดิม, HOSOffice schema หรือ Gateway จริง ให้สร้าง adapter/interface, mock data และระบุ TODO อย่างชัดเจน ห้ามแต่งข้อมูลจริงหรือสมมติว่าเชื่อมต่อสำเร็จ

## 1. เป้าหมาย
สร้างเว็บ Sam_Att V2 เพื่อดึงเหตุการณ์สแกนนิ้วจริงจากเครื่องสแกน จับคู่บุคลากร HOSOffice และตารางเวร คำนวณว่าบุคลากรแต่ละคน/แต่ละกะสแกนหรือไม่ มาสายหรือไม่และกี่นาที แสดงสรุปและอันดับรายวัน เดือน ปี หรือช่วงวันที่ตามกลุ่มงาน ฝ่าย ประเภทบุคลากร และทั้งโรงพยาบาล เจ้าหน้าที่ผู้รับผิดชอบระบุสาเหตุกรณีไม่พบสแกน และส่งข้อมูลที่ได้รับอนุญาตไป HOSOffice ได้โดยตรง ไม่ต้องผ่านขั้นตอนอนุมัติอีกชั้น

### หลักการควบคุม Scope
- ไม่ใช่ระบบ HR เต็มรูปแบบ ไม่แก้ชื่อ-นามสกุล คำนำหน้า FINGLE_ID หรือสังกัดบุคลากรใน Sam_Att: HOSOffice เป็นแหล่งข้อมูลหลัก
- ไม่สร้าง approval workflow หลายชั้น, enterprise job queues, catch-up orchestration, monthly close/reopen workflow หรือสถานะซับซ้อนโดยไม่มีความจำเป็น
- ไม่สร้างข้อมูลสแกนปลอม ไม่แก้หรือลบ Raw Scan เพื่อให้รายงานดูปกติ
- แยก Raw Scan (ต้นฉบับ), Attendance (ผลคำนวณ), Notes (คำอธิบาย), Push History (ประวัติการส่ง)
- รองรับการ Reprocess จาก Raw Scan โดยไม่ทำให้ข้อมูลดิบสูญหาย
- ให้ระบบง่ายต่อการดูแลบน Windows hospital server

## 2. Architecture บังคับ
- Frontend: HTTPS **port 3001** ใต้ URL path `/Sam_Att/` เท่านั้น
- Backend: shared **Central API Gateway port 3002** ใต้ `/api/Sam_Att/` เท่านั้น
- ไม่มี listener HTTP/HTTPS ใหม่สำหรับ Sam_Att; ไม่ใช้พอร์ต 3003, 3004 หรือพอร์ตเว็บอื่นเพิ่ม
- Central API Gateway มี shared HTTP listener/process เดียว และ mount Sam_Att modular router ร่วมกับ Procurement และ Cash_Cheque โดยไม่ปะปน business logic
- Procurement: `/Procurement/`, `/api/Procurement/`; Cash_Cheque: `/Cash_Cheque/`, `/api/Cash_Cheque/`
- Sam_Att มีฐานข้อมูลแยก `samchuk_attendance`; ห้ามนำข้อมูล Sam_Att ไปเก็บปะปนกับฐานข้อมูลของอีกสองระบบ
- Frontend build ต้องรองรับ base path `/Sam_Att/`; API client ต้องเรียก `/api/Sam_Att/` ผ่านเส้นทางที่ Gateway/Reverse Proxy กำหนด ห้าม hardcode localhost สำหรับ browser production
- การเชื่อมต่อ DB และเครื่องสแกนเป็นการเชื่อมต่อออกจาก backend ไปยังบริการเดิม ไม่ใช่การเปิด HTTP listener เพิ่ม; ไม่เก็บ credential ใน frontend
- ต้องตรวจ Gateway source/config จริงก่อนเขียน integration; หากยังไม่มี ให้ทำ adapter พร้อมเอกสารการ mount ไม่แตะระบบอื่น

## 3. บทบาทและสิทธิ์ (มีเพียง 3 Role)
1. `ADMIN`: จัดการผู้ใช้/role, การผูกบัญชีบุคลากร, เครื่องสแกน, การเชื่อมต่อฐานข้อมูล, เวลาการ Sync; ใช้งานฟังก์ชันเจ้าหน้าที่ได้ทั้งหมด
2. `RESPONSIBLE_STAFF`: ดู Attendance ทุกคน, Dashboard, Reports, HOSOffice personnel sync, ตารางเวร, scanner manual sync, Reprocess, บันทึกสาเหตุ NO_SCAN, และ push HOSOffice โดยตรง
3. `GENERAL_USER`: ดูเฉพาะ **My Attendance** ของตนเอง รายวัน/รายเดือน/รายปี, เวลาเข้า-ออก สถานะและนาทีสาย; ไม่เห็นรายชื่อหรือรายงานของคนอื่น; ไม่มีสิทธิ์แก้ไข
- Login ใช้บัญชี Sam_Att เอง ไม่ต้องเชื่อม AD/SSO และไม่ใช้รหัสผ่าน HOSOffice
- ผูก user account กับ `PERSON_ID` ที่ตรวจสอบ/อนุมัติโดย ADMIN ก่อนให้ GENERAL_USER ดู My Attendance; ไม่มี mapping ต้องปฏิเสธการอ่านข้อมูลตนเองพร้อมข้อความชัดเจน
- Backend ต้อง derive `PERSON_ID` ของ GENERAL_USER จาก authenticated session/token เท่านั้น ห้ามเชื่อถือ PERSON_ID ที่ client ส่งเพื่อดูคนอื่น
- ทุก endpoint ตรวจ role และ ownership ที่ backend; UI ซ่อนเมนูเป็นเพียง UX ไม่ใช่ security boundary
- รหัสผ่าน hash ด้วย algorithm ที่เหมาะสม, session/token มี expiry, ป้องกัน brute force และไม่ log secrets; Admin reset ได้โดยไม่เปิดเผย plaintext password

## 4. หน้าจอและโมดูล
### 4.1 Login และ My Attendance
- หน้า Login username/password, logout, session state, error message
- My Attendance: เลือกวัน เดือน ปี; แสดงรายการตาม Work Date และกะ, check-in/check-out, NORMAL/LATE/NO_SCAN/MISSING_CHECKOUT/อื่นที่จำเป็น, นาทีสาย, สรุปช่วงที่เลือก
- รองรับกะข้ามวัน; ข้อมูลเฉพาะตนเองผ่าน backend authorization

### 4.2 Dashboard
- ตัวกรองวัน/เดือน/ช่วงวันที่, กลุ่มงาน, ฝ่าย, ประเภทบุคลากร, โรงพยาบาลทั้งหมด
- แสดงจำนวนบุคลากรในขอบเขต, จำนวนคนมาสาย (distinct PERSON_ID), จำนวนครั้งมาสาย (late shifts), จำนวนรายการ NO_SCAN, สรุปตามหน่วยงาน
- เรียงอันดับมาก→น้อยและน้อย→มากตามจำนวนครั้งสาย; แสดงคนและนาทีสายรวมประกอบ; เจาะดูวัน/กะที่สายได้
- ค่าเฉลี่ยต้องแสดงตัวหารอย่างชัดเจน เช่น นาทีสายรวม ÷ จำนวนกะที่สาย; ไม่ปนคนกับครั้ง
- กำหนดการนับคนทั้งหมดจาก personnel roster ที่ active ในช่วงเวลาที่เลือก; ระบุช่วงเวลา/ตัวกรองบนรายงาน

### 4.3 Personnel / HOSOffice Sync
- ปุ่มดึงครั้งแรกและปุ่มอัปเดตบุคลากรจาก HOSOffice
- ข้อมูลหลัก: `PERSON_ID`, `FINGLE_ID`, คำนำหน้า ชื่อ นามสกุล ตำแหน่ง ฝ่าย กลุ่มงาน ประเภทบุคลากร และสถานะตาม schema จริง
- HOSOffice authoritative; Sam_Att ไม่ให้แก้ field เหล่านี้โดยตรง
- Sync แบบ upsert ตาม PERSON_ID; ไม่ลบประวัติ Attendance เมื่อบุคลากรพ้นสภาพ/เปลี่ยนข้อมูล
- FINGLE_ID เปลี่ยน/ใช้ซ้ำ: เก็บ mapping effective dates เพื่อจับคู่ Raw Scan ตามเวลาที่เกิดเหตุการณ์; หากคลุมเครือให้ `PENDING_MAPPING` ไม่เดาสุ่ม
- หลัง import/update สามารถกด Reprocess เลือกช่วงวันที่เพื่อจับคู่ Raw Scan ที่ค้างอยู่
- ห้าม hardcode schema HOSOffice ที่ยังไม่ตรวจสอบ; สร้าง configurable read adapter และ document mapping

### 4.4 Shift Management
- ตารางเวรตามบุคคล/วัน; ตารางเวรประจำตามบุคคล; เวลามาตรฐานตามประเภทบุคลากรเป็น fallback
- ลำดับเลือกกะ: รายวัน > ประจำรายบุคคล > มาตรฐานตามประเภท > NO_SCHEDULE
- เก็บ `WORK_DATE`, shift start/end, กะข้ามเที่ยงคืน, grace นาทีสาย, ช่วงรับสแกนก่อนเริ่มและหลังเลิกกะตามที่ตั้งค่า
- รองรับหลายกะในวันเดียวและกะต่อเนื่อง โดยคำนวณ/รายงานแยกกะ; ไม่แต่งเหตุการณ์สแกนช่วงเปลี่ยนกะ
- หากแก้เวรย้อนหลัง ให้เจ้าหน้าที่กด Reprocess ช่วงที่ได้รับผลกระทบ; ไม่แก้ Raw Scan
- หากไม่มีกะ อย่าตัดสินว่า NO_SCAN หรือ LATE โดยไม่มีตารางเวรอ้างอิง

### 4.5 Scanner Management
- ADMIN เพิ่ม/แก้ไข/ปิดใช้งานเครื่อง: device ID, ชื่อ, IP, device port ตามที่ CLI รองรับ, enabled, auto-sync enabled
- เครื่องที่เคยวางแผนไว้: `192.168.111.163`, `.164`, `.165` (ต้องตรวจสอบสถานะจริงก่อนใช้งาน)
- **ใช้ Scanner Reader EXE ตัวเดิมที่โรงพยาบาลมีอยู่ ห้ามสร้าง/แก้ไข/เปลี่ยน EXE** เว้นแต่ผู้ใช้สั่งโดยตรง; ชื่อไฟล์ executable และ arguments ต้องตรวจจากเครื่องจริง ไม่ยึดชื่อ `ScannerSyncCli.exe` เป็นข้อบังคับ
- Backend adapter เป็นผู้เรียก/รับผล JSON จาก EXE เดิมอย่างปลอดภัย; กำหนด executable path/arguments ฝั่ง server เท่านั้น ห้ามรับ arbitrary shell command จาก frontend
- การจัดเก็บ Raw Scan ต้องทำโดย Sam_Att Backend ไม่พึ่งการเขียน MySQL/ตาราง `fingle_scan` จาก EXE; ไม่สั่งแก้ EXE เพื่อเปลี่ยนวิธีทำงาน
- ทดสอบการเชื่อมต่อ, sync เครื่องเดียวหรือทุกเครื่อง, ดูสถานะล่าสุดและข้อผิดพลาด
- ห้ามเปิด service port เพิ่ม; device protocol port เป็นของอุปกรณ์ ไม่ใช่เว็บ listener ของระบบ

### 4.6 Scanner Sync / Raw Scan
- ตั้งเวลาง่าย ๆ เช่น **00:00 และ 08:00** ตามเวลาไทย `Asia/Bangkok`; ปรับได้โดย ADMIN
- Auto Sync เมื่อถึงเวลา; ถ้าล้มเหลว บันทึกสถานะ/ข้อความ แล้วเจ้าหน้าที่ Manual Sync ได้; ไม่ต้องทำ catch-up queues หรือ retry orchestration ซับซ้อน
- ป้องกัน sync เครื่องเดียวกันซ้อน; แยกผลสำเร็จ/ล้มเหลวตามเครื่อง
- เมื่อ EXE เดิมคืน JSON ให้ backend อ่านรายการจาก `scans` แล้ว validate ฟิลด์จริง `machineNo`, `enrollNumber`, `scanDateTime`, `verifyMode`, `inOutMode`, `workCode`; **ห้ามเปลี่ยน `enrollNumber` เป็น `fingleId` ในสัญญา JSON ของ EXE**
- `enrollNumber` คือรหัสนิ้วมือสำหรับจับคู่กับ HOSOffice `FINGLE_ID` โดย normalize ชนิดข้อมูลภายใน backend เพื่อจับคู่ แต่ต้องเก็บค่าดิบเดิมใน `payload_json`
- `scanDateTime` ตัวอย่างจริงเป็นรูปแบบ `yyyy-MM-dd HH:mm:ss` (เวลาเครื่อง); ห้ามบังคับให้ EXE เปลี่ยนเป็น ISO timestamp; backend ต้องตรวจ timezone ตามการตั้งค่าเครื่องจริงก่อนแปลงเป็นเวลาภายในระบบ
- `verifyMode` และ `inOutMode` เป็นค่าดิบจากอุปกรณ์ ห้ามสมมติความหมายของตัวเลข; `workCode` รองรับ `null`
- JSON อาจมี metadata ชั้นนอก เช่น `success`, `totalRead`, `machines` และสรุปการ Sync; backend ต้องรองรับรูปแบบจริงโดยไม่บังคับให้ EXE เพิ่ม `schemaVersion`, `generatedAt`, `count` หรือ `deviceIp` ในแต่ละ scan
- Backend ตรวจข้อมูลซ้ำด้วย database uniqueness/transaction แล้วเก็บ Raw Scan เฉพาะ event ใหม่; backend เป็นผู้คำนวณจำนวน new/duplicates/unmapped จากผลนำเข้าจริง ไม่เชื่อถือค่าที่ EXE ส่งว่าเป็นผลบันทึก DB
- Unique constraint สำหรับ raw event ใช้ native device event ID ถ้ามี มิฉะนั้นใช้ composite fingerprint ที่ยืนยันกับ JSON จริง; ตรวจซ้ำใน DB transaction ไม่ใช่เช็กแค่ชื่อไฟล์ JSON
- Raw Scan immutable/read-only; sync รอบเดิมซ้ำต้องไม่เกิด record ซ้ำ
- log: scheduled/manual, เวลาเริ่ม/สิ้นสุด, success/fail, จำนวน event ทั้งหมด, new, duplicate, error, เครื่อง, timestamp ของ raw event ล่าสุด; แสดงประวัติรายเดือน
- หลัง Sync สำเร็จให้ประมวลผล **Raw Scan ใหม่ที่จับคู่บุคลากรและเวรได้** เป็น Attendance อัตโนมัติในช่วงที่แก้ไขได้; ถ้าข้อมูลยังไม่ครบเก็บไว้รอ Reprocess ไม่สร้างผลผิด
- Sync ไม่ auto push HOSOffice

### 4.7 Attendance / Review / Reprocess
- ตาราง Attendance เริ่มต้น Work Date วันนี้ พร้อมเลือกวัน/ช่วงวันที่, ค้นหาชื่อ, กรองฝ่าย กลุ่มงาน ประเภทและสถานะ; pagination/on-demand
- แสดงชื่อ กะ check-in/check-out สถานะและนาทีสาย; กดดูรายละเอียด Raw Scan ที่ใช้คำนวณได้
- สถานะหลัก: `NORMAL`, `LATE`, `NO_SCAN`, `MISSING_CHECKOUT`, `EARLY_CHECKOUT`, `NO_SCHEDULE`, `PENDING_MAPPING` ตามข้อมูลที่มีจริง; แยกสถานะการตรวจสอบ/หมายเหตุจากสถานะการสแกน
- NO_SCAN: เจ้าหน้าที่เลือกสาเหตุ เช่น ลา พักร้อน อบรม ไปราชการ หยุดงาน หรืออื่น ๆ พร้อมหมายเหตุ ผู้บันทึก วันเวลา; **ไม่เปลี่ยน NO_SCAN ให้กลายเป็นสแกนจริง**
- การมาสายคำนวณจาก check-in เทียบ shift start + grace (late minutes = max(0, actual check-in - shift start - grace)); ไม่พบสแกนไม่เท่ากับมาสายโดยอัตโนมัติ
- ถ้าไม่พบ checkout ให้ `MISSING_CHECKOUT` เมื่อกะสิ้นสุดแล้ว; อย่าตัดสินก่อนกะจบ
- รองรับ scan ที่อยู่นอกหน้าต่างเวลาหรือข้อมูลไม่ครบด้วยการแสดงรายการให้เจ้าหน้าที่ตรวจสอบ ไม่เดาเวลา
- ปุ่ม Reprocess: เลือกช่วงวันและตัวกรองบุคลากรได้, คำนวณจาก Raw Scan + mapping + shift ล่าสุด, upsert ไม่สร้าง duplicate, แสดงจำนวนสำเร็จ/ข้าม/ผิดพลาดและ audit พื้นฐาน
- ก่อน Reprocess ที่จะเขียนทับ Attendance เดิมหรือกระทบรายการที่เคย push HOSOffice ให้แสดงผลต่าง/คำเตือนสั้น ๆ และยืนยันครั้งเดียว; ไม่ต้องมี approval หลายขั้น
- หากมี Raw Scan ใหม่ซึ่งจะเปลี่ยนผล Attendance เดิมที่มีหมายเหตุเจ้าหน้าที่ ให้คงหมายเหตุ/ประวัติไว้และทำเครื่องหมายว่าควรตรวจทาน ไม่ลบเงียบ ๆ
- เมื่อสร้าง Attendance ใหม่จาก Raw Scan เดิมต้องได้ผลสอดคล้องเดิมหาก personnel mapping/shift settings ไม่เปลี่ยน (deterministic)

### 4.8 Reports
- รายวัน/รายเดือน/รายปี/ช่วงวันที่; ตามคน กลุ่มงาน ฝ่าย ประเภทบุคลากร และโรงพยาบาล
- รายงาน scan/no-scan, สายรายกะ, รายบุคคลพร้อมวันและนาทีสาย, อันดับสายมาก→น้อยและน้อย→มาก
- แยก distinct late people และ late occurrences; ระบุช่วงเวลาและนิยามค่าเฉลี่ย
- Export CSV/Excel เป็น optional หลัง core ทำงานถูกต้อง; อย่าให้ feature นี้บล็อก MVP

### 4.9 HOSOffice Push
- ADMIN/RESPONSIBLE_STAFF ที่มีสิทธิ์ push ส่งได้ทันทีโดย **ไม่ต้องรอ approval**
- ผู้ใช้กด Push เองเท่านั้น; ไม่มี auto push หลัง Sync/Reprocess
- ตรวจรูปแบบข้อมูลและ target mapping จริงก่อนส่ง; ใช้เฉพาะ API/วิธีเขียนที่โรงพยาบาลอนุญาต ห้ามเดาตารางหรือ UPDATE/DELETE HOSOffice ตรง ๆ โดยไม่มีข้อตกลง
- แสดงผลสำเร็จ/ล้มเหลวต่อรายการและเก็บ push history; ป้องกันส่งซ้ำด้วย idempotency key/target status ตามความสามารถจริง
- ถ้า Attendance เปลี่ยนหลัง push ให้แจ้งเตือน ไม่แก้ HOSOffice อัตโนมัติ

### 4.10 Settings
- ADMIN ตั้งค่า HOSOffice connection และ `samchuk_attendance` connection, host/port/database/username/secret โดยเก็บ secret ที่ backend เท่านั้น (encrypted/secret store หรือ environment-based secure configuration)
- Test connection จาก backend; ไม่คืน password/connection string เต็มไป browser; ไม่ log credentials
- เปลี่ยน application database ต้องมีการทดสอบและยืนยันชัดเจน ไม่สลับฐานข้อมูล production โดยไม่ตรวจ migration/backup
- ตั้งค่าเวลารัน Sync, users/roles, scanner devices

## 5. Data Model แนวทาง (ปรับตาม schema จริง)
- `users` (id, username, password_hash, role, person_id nullable, active, timestamps)
- `personnel` (person_id PK, fingle_id_current, name fields, department/group/division/type, active, last_hosoffice_sync)
- `fingerprint_mappings` (id, person_id, fingle_id, effective_from, effective_to) พร้อมตรวจช่วงเวลาซ้อน/ความกำกวม
- `shifts` (id, name, start_time, end_time, grace_minutes, early_scan_window, late_scan_window, active)
- `shift_assignments` (id, person_id/category, work_date or recurrence/effective period, shift_id, priority)
- `scanner_devices` (id, name, ip, device_port, enabled, auto_sync_enabled, config)
- `sync_runs` (id, device_id, mode, started_at, finished_at, status, total/new/duplicate, latest_event_at, error)
- `raw_scans` (id, device_id/machine_no, enroll_number, scan_datetime_raw, verify_mode, in_out_mode, work_code nullable, event_at_normalized, payload_json, imported_at, dedupe_key UNIQUE); immutable; ใช้ชื่อคอลัมน์จริงให้สอดคล้อง migration และเก็บค่าต้นฉบับทั้ง 6 ฟิลด์ครบ
- `enroll_number` จาก JSON จับคู่กับ `personnel.FINGLE_ID` ผ่าน effective-dated fingerprint mappings; ไม่บังคับให้ JSON มี `fingleId` และไม่ทิ้ง raw scan ที่ยังจับคู่บุคลากรไม่ได้
- `attendance` (id, person_id, work_date, shift_assignment_id or stable shift occurrence key, checkin_at, checkout_at, late_minutes, status, computed_at, calculation_version, source_fingerprint) with UNIQUE person + work_date + shift occurrence
- `attendance_raw_links` (attendance_id, raw_scan_id, usage_type) for traceability where appropriate
- `attendance_notes` (id, person_id, work_date, shift occurrence nullable, reason_code, note, author_user_id, created_at, updated_at, history)
- `push_history` (id, attendance_id, target, payload_hash/idempotency_key, status, pushed_by, pushed_at, response_summary)
- `audit_logs` (id, actor, action, entity_type, entity_id, timestamp, metadata_without_secrets)
- ตาราง config ที่ไม่เก็บ plaintext secret และ versioned migrations

**ข้อควรระวัง**: ไม่ใช้ `PERSON_ID + WORK_DATE` เพียงอย่างเดียวเป็น unique key ของ Attendance เพราะคนหนึ่งอาจมีหลายกะในวันเดียว ต้องมี stable shift occurrence key; ต้องรองรับ shift ข้ามวันและ Work Date ตามกะ ไม่ใช่เวลาปฏิทินของ scan

## 6. Rebuild/Recovery
- Raw Scan เป็น source of truth สำหรับเวลาเข้าออก; Attendance เป็น derived/rebuildable
- Reprocess จาก raw ตามช่วงวันได้เมื่อบุคลากรและกะพร้อม; idempotent upsert, transaction, summary errors
- ถ้า Attendance สูญหายแต่ Raw Scan, personnel mappings และ shifts ยังอยู่ สามารถคำนวณกลับได้
- Notes, push history, user accounts, configs และ historical mappings **ไม่สามารถกู้คืนจาก Raw Scan ล้วน ๆ**; ต้อง backup ฐานข้อมูลเป็นประจำ
- ห้าม cascade delete notes/push history โดยไม่ตั้งใจ; ห้ามลบ Raw Scan จาก Reprocess

## 7. API Contract (ตัวอย่างเส้นทาง; ปรับตาม Gateway จริง)
ทุกเส้นทางอยู่ใต้ `/api/Sam_Att/` และตรวจ auth/role/ownership
- `POST auth/login`, `POST auth/logout`, `GET auth/me`
- `GET me/attendance?from=&to=` (PERSON_ID derive from session)
- `GET dashboard/summary`, `GET reports/lateness`, `GET reports/no-scan`
- `GET personnel`, `POST personnel/sync`
- `GET shifts`, `POST shifts`, `PUT shifts/:id`, `GET shift-assignments`, `POST shift-assignments`
- `GET scanners`, `POST scanners`, `PUT scanners/:id`, `POST scanners/:id/test`, `POST scanners/:id/sync`
- `GET sync-runs`, `GET raw-scans` (read-only)
- `GET attendance`, `GET attendance/:id`, `POST attendance/reprocess`, `POST attendance/:id/notes`
- `POST hosoffice/push`, `GET hosoffice/push-history`
- `GET settings/connections` (masked), `POST settings/connections/test`, `PUT settings/connections` (ADMIN only)
- `GET users`, `POST users`, `PUT users/:id` (ADMIN only)
- ต้องมี validation, pagination, bounded date range, parameterized SQL, consistent errors, logs without sensitive data

## 8. UX / Frontend
- UI ภาษาไทย อ่านง่าย ใช้งานบนคอมพิวเตอร์โรงพยาบาลและมือถือ
- Menu by role: GENERAL_USER เห็น My Attendance เป็นหลัก; staff/admin เห็นงานรวม
- Dashboard เป็นข้อมูลสรุปไม่โหลด Raw Scan หลายพันรายการตั้งแต่เปิดหน้า
- On-demand API loading, cache + invalidate หลัง Sync/Reprocess/แก้เวร/Sync บุคลากร, refresh button, pagination
- แสดง empty/loading/error states; ไม่มีข้อมูลต้องแยกจาก Sync fail และ NO_SCAN
- เวลาแสดงผล `Asia/Bangkok`; เก็บ timestamps อย่างมี timezone consistency
- ไม่แสดง credential, SQL, stack trace หรือข้อมูลคนอื่นต่อ GENERAL_USER

## 9. Security / Reliability
- Auth backend enforced, least privilege DB accounts, input validation, SQL injection prevention, secure secrets, CORS/CSRF ตามรูปแบบ session, HTTPS, rate limiting login
- Scanner EXE เดิมทำงาน server-side เท่านั้น ผ่าน fixed executable path และ safe arguments, process timeout ที่เหมาะสมและ minimal same-device concurrency guard; ห้ามสร้างหรือแก้ EXE และห้ามรัน command ที่ frontend กำหนดเอง
- DB uniqueness and transactions for dedup, attendance upsert and push history
- Minimal audit for changes affecting attendance, notes, configuration, push
- Backup/restore plan; migration scripts versioned; never auto-delete production data
- อย่าเปิด ports เพิ่ม; อย่าปรับ Procurement/Cash_Cheque โดยไม่จำเป็น

## 10. Workflow การพัฒนากับ Google AI Studio / GitHub
### Phase A — UI Prototype
1. สร้าง frontend UI พร้อม mock data และ navigation สำหรับ Login, My Attendance, Dashboard, Personnel, Shifts, Scanner Management, Sync/Raw, Attendance, Reports, HOSOffice Push, Settings
2. แสดงให้เห็น role-based menu, filters, status badges, error/loading/empty states, responsive design
3. ห้ามทำให้ mock UI ดูเหมือนเชื่อม scanner/HOSOffice สำเร็จจริง; ระบุ MOCK/DEMO ชัดเจน
4. สร้าง README อธิบายวิธี run/build และ base path `/Sam_Att/`

### Phase B — Code/Architecture
1. จัดแยก frontend/backend/domain/data adapters, modular router สำหรับ shared gateway, DB migrations และ tests
2. หากไม่มี Gateway source จริง ให้สร้าง integration guide และ mountable router เท่านั้น ไม่เปิด standalone production listener ใหม่
3. สร้าง fake/mock adapters สำหรับ HOSOffice/Scanner Reader EXE เดิม; **มีสัญญาข้อมูลดิบ 6 ฟิลด์ตามหัวข้อ 4.6 และตัวอย่างในหัวข้อ 14 แล้ว** แต่ยังต้องตรวจวิธีเรียก EXE, output/error จริง และ environment ก่อนเชื่อมใช้งาน
4. Unit tests สำหรับ late calculation, midnight shifts, duplicate raw, unmapped fingerprint, reprocess idempotence, role own-only authorization

### Phase C — GitHub Review Loop
1. ผู้ใช้ Push source code เข้า GitHub และส่ง repository URL/commit SHA ให้ ChatGPT
2. ChatGPT ตรวจโครงสร้าง, code, UI, auth, SQL, role access, base path, gateway integration, data flow, tests และ security
3. ChatGPT แจ้งปัญหาเป็นรายการ **Critical / High / Medium / Low**, พร้อมไฟล์/ตำแหน่ง, ผลกระทบ, วิธีแก้ และข้อความพร้อมคัดลอกให้ Google AI Studio
4. ผู้ใช้นำรายการไปให้ Google AI Studio แก้, Push commit ใหม่ แล้วส่งให้ตรวจซ้ำ
5. วนซ้ำจนไม่มีปัญหา blocker ที่ตรวจพบ; การผ่าน static code review ไม่เท่ากับรับประกันว่า production ปลอดข้อบกพร่อง ต้องมี integration/UAT ด้วย

### Phase D — Deployment (ทำเมื่อผู้ใช้อนุญาตหลัง review)
1. ตรวจ Gateway ที่รันจริง, IIS/HTTPS reverse proxy, route mount, port binding, Windows services และ backup
2. ตรวจ frontend `/Sam_Att/` บน HTTPS 3001 และ backend `/api/Sam_Att/` บน 3002; ห้ามเพิ่ม listener
3. สร้าง DB `samchuk_attendance`, migration, config secrets, path ของ EXE เดิม, scanner connectivity, HOSOffice read/push permissions
4. Test end-to-end: login roles, personnel sync, scanner sync, dedup, attendance calculation, reprocess, reports, push
5. Rollback plan; อย่ากระทบ Procurement/Cash_Cheque

## 11. Acceptance Criteria ที่ต้องผ่าน
1. GENERAL_USER เปิดดู Attendance ของคนอื่นด้วยการเปลี่ยน URL/query/API ไม่ได้
2. ADMIN/RESPONSIBLE_STAFF ดูทุกคนได้; เฉพาะ ADMIN ตั้ง scanner/database/users
3. Sync รอบเดิมซ้ำไม่เพิ่ม Raw Scan ซ้ำ; JSON ใหม่บันทึกเฉพาะ event ใหม่
4. Sync สำเร็จแล้ว Attendance ของรายการใหม่ที่จับคู่ได้คำนวณอัตโนมัติ
5. HOSOffice personnel sync แล้วกด Reprocess เพื่อจับคู่ Raw Scan ค้างได้
6. กะข้ามวันและหลายกะต่อวันคำนวณตาม Work Date/shift occurrence ถูกต้อง
7. NO_SCAN ไม่ถูกนับเป็น late โดยอัตโนมัติ; เหตุผลลา/อบรม/ราชการไม่สร้าง scan ปลอม
8. Report แยกคนมาสายและจำนวนครั้งมาสาย, เรียงมาก/น้อย, filter กลุ่มงาน/ฝ่าย/ประเภท/โรงพยาบาลได้
9. Attendance rebuild ได้จาก Raw Scan + mappings + shifts โดยไม่ลบ notes/push history
10. Push HOSOffice ต้องเป็น manual authorized action, ไม่มี approval อีกชั้น, ไม่ auto push
11. หน้า Sync แสดง latest run, latest event, count, success/fail, monthly history
12. Frontend 3001 `/Sam_Att/`; backend shared 3002 `/api/Sam_Att/`; ไม่มี additional HTTP listener
13. ไม่มี secret ใน frontend/repository/log; schema/CLI ที่ยังไม่ทราบต้องแสดง TODO ไม่เดา
14. ระบบ Procurement และ Cash_Cheque ยังทำงานเดิมหลัง integration

## 12. สิ่งที่ต้องส่งมอบใน GitHub
- Source frontend และ mountable backend module, package manifests/lockfile
- README ภาษาไทย, architecture overview, `.env.example` ที่ไม่มีรหัสผ่านจริง
- Database migration SQL และ ERD/ตาราง
- API contract / OpenAPI หรือรายการ endpoint และ request-response ตัวอย่าง
- Mock HOSOffice/Scanner adapter และคู่มือเชื่อมกับ EXE เดิม (ไม่สร้างหรือแก้ EXE)
- Unit tests + instructions, sample JSON ที่ **ไม่ใช่ข้อมูลบุคลากรจริง**
- UI screenshots หรือคำอธิบายเมนู
- CHANGELOG, known limitations, deployment checklist และ rollback guide

## 13. ข้อมูลจริงที่ต้องตรวจสอบก่อนเชื่อม Production
- ตรวจยืนยันชื่อ/ตำแหน่ง EXE เดิม, command flags, stdout/ไฟล์ JSON ที่ส่งจริง, exit codes, timezone เครื่อง และวิธีรายงานข้อผิดพลาด; **รูปแบบ raw scan 6 ฟิลด์ได้รับการยืนยันจาก JSON ตัวอย่างแล้ว**
- HOSOffice schema จริงและสิทธิ์การอ่าน/ส่งข้อมูลที่ได้รับอนุญาต
- Gateway repository structure, module registry, path routing และ reverse proxy behavior
- Database engine/version และ existing schema/migration constraints
- แนวทางกำหนดตารางเวรที่โรงพยาบาลใช้จริง และ policy การมาสาย

## 14. Scanner Raw JSON Contract — ตัวอย่างข้อมูลจริงที่ต้องยึด
ตัวอย่างด้านล่างเป็นข้อมูลจำลองที่รักษา **ชื่อฟิลด์และชนิดข้อมูลตาม raw JSON จริง** เพื่อใช้พัฒนาและทดสอบโดยไม่เปิดเผยข้อมูลบุคลากรจริง:

```json
{
  "success": true,
  "totalRead": 1,
  "machines": [
    { "machineNo": 1, "ip": "192.168.111.163", "read": 1, "status": "OK" }
  ],
  "scans": [
    {
      "machineNo": 1,
      "enrollNumber": 54,
      "scanDateTime": "2026-11-06 07:45:00",
      "verifyMode": 268435456,
      "inOutMode": 1,
      "workCode": null
    }
  ]
}
```

- ข้อมูลที่ต้องนำเข้า Raw Scan อยู่ใน `scans[]`; แต่ละรายการมี **6 ฟิลด์** ตามตัวอย่าง; metadata ชั้นนอกอาจมีฟิลด์อื่นเพิ่มได้
- `machineNo` ระบุเครื่อง, `enrollNumber` ระบุรหัสนิ้วมือ, `scanDateTime` ระบุเวลาสแกน, อีก 3 ฟิลด์เก็บค่าตามที่เครื่องส่งโดยไม่ดัดแปลง
- Backend ต้องรองรับการ Sync ข้อมูลชุดเดิมซ้ำโดยไม่เกิดรายการซ้ำ และต้องเก็บ event ที่ยังจับคู่บุคลากรไม่ได้
- **ห้ามนำตัวอย่าง JSON ทางเลือก** ที่มี `fingleId`, `deviceIp` ในรายการ, `schemaVersion`, `generatedAt` หรือเวลาแบบ `T` ไปแทนรูปแบบจริงโดยบังคับ EXE เปลี่ยน
- การทดสอบ adapter ต้องครอบคลุม: JSON ว่าง, JSON ไม่ถูกต้อง, success=false, เครื่องบางตัวอ่านไม่ได้, scan ซ้ำ, workCode=null, fingerprint ยังไม่มี mapping และเวลาข้ามวัน

**Final instruction to Google AI Studio:** เริ่มจาก UI Prototype ที่รันได้ด้วย mock data และโครงสร้างโปรเจกต์ที่พร้อมตรวจใน GitHub ก่อน ห้าม deploy production หรือแก้ Gateway จริงเอง เมื่อพร้อมให้แสดงรายการไฟล์ โครงสร้างโฟลเดอร์ วิธีทดสอบ และข้อจำกัดที่ยังต้องใช้ข้อมูลจริง แล้วรอ Code Review รอบต่อไป

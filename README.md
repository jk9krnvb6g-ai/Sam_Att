# Sam_Att V2 — Samchuk Hospital Attendance Management System
## ระบบบริหารจัดการเวลาการปฏิบัติงาน โรงพยาบาลสามชุก V2

> **ฉบับ Final Scope — Updated Scanner JSON Contract (6 พฤศจิกายน 2026)**  
> **สถานะรอบแรก:** UI Prototype & Source Code Architecture พร้อมนำขึ้น GitHub เพื่อ Code Review

---

## 1. ภาพรวมระบบ (System Overview)

ระบบ **Sam_Att V2** พัฒนาขึ้นสำหรับโรงพยาบาลสามชุก เพื่อทำหน้าที่:
1. ดึงข้อมูลการสแกนนิ้วจริงจากเครื่องสแกนของโรงพยาบาล (ผ่านโปรแกรม **Scanner Reader EXE ตัวเดิม** โดยไม่สร้างหรือแก้ EXE)
2. จับคู่รหัสนิ้วมือ (`enrollNumber`) กับ `FINGLE_ID` ของบุคลากรที่ซิงค์มาจากฐานข้อมูล HOSOffice
3. เปรียบเทียบกับตารางเวรปฏิบัติงาน (Shifts & Assignments) เพื่อคำนวณว่าบุคลากรมาปฏิบัติงานหรือไม่ มาสายหรือไม่ และสายกี่นาที
4. เจ้าหน้าที่ผู้รับผิดชอบสามารถระบุสาเหตุในกรณีไม่พบการสแกน (`NO_SCAN`) เช่น ลาป่วย ลากิจ ไปราชการ หรือหยุดตามเวร
5. สามารถส่งผลการลงเวลาไปยังระบบ HOSOffice ได้โดยตรง (**Direct Push**) โดยไม่ต้องผ่านขั้นตอนอนุมัติหลายชั้น

---

## 2. สถาปัตยกรรมระบบที่รองรับ (Architecture)

- **Frontend:** พอร์ต `3001` (HTTPS) ภายใต้ URL Path `/Sam_Att/`
- **Backend API:** Central API Gateway พอร์ต `3002` ภายใต้ URL Path `/api/Sam_Att/`
- **Shared Listener:** ทำงานเป็น Modular Router ร่วมกับระบบ `Procurement` และ `Cash_Cheque` โดยไม่สร้าง HTTP Listener หรือเปิดพอร์ตใหม่
- **Database:** แยกอิสระในชื่อฐานข้อมูล `samchuk_attendance` ไม่ปะปนกับฐานข้อมูลอื่น

---

## 3. ระบบสิทธิ์และบทบาทผู้ใช้งาน (3 Roles)

| บทบาท (Role) | สิทธิ์การเข้าถึง | บุคคลตัวอย่างในระบบจำลอง |
| :--- | :--- | :--- |
| **`ADMIN`** | จัดการเครื่องสแกน, บัญชีผู้ใช้, ผูกรหัสบุคคล, ตั้งค่าฐานข้อมูลและเวลารอบการ Sync, ใช้งานฟังก์ชันของเจ้าหน้าที่ได้ทั้งหมด | นายพิสิษฐ์ ทวีสาร (`admin`) |
| **`RESPONSIBLE_STAFF`** | ดูแดชบอร์ดภาพรวม, ดูเวลาทุกคน, ตรวจสอบบันทึกเวลา, ดึงบุคลากร HOSOffice, จัดการเวร, กด Reprocess, บันทึกสาเหตุ NO_SCAN, ส่งข้อมูลไป HOSOffice | นางสาวพัชรี เจริญผล (`staff_patcharee`) |
| **`GENERAL_USER`** | ดูเฉพาะ **"เวลาปฏิบัติงานของฉัน" (My Attendance)** ของตนเองเท่านั้น ไม่สามารถดูข้อมูลหรือรายงานของผู้อื่นได้ | พญ.สุดารัตน์ (`dr_sudarat`)<br/>นายวิชัย พยาบาล (`nurse_wichai`) |

*หมายเหตุ: ใน UI Prototype มีแถบสลับบทบาท (Quick Persona Switcher) เพื่อให้ผู้พัฒนาและผู้ตรวจสอบใน GitHub สามารถสลับทดสอบทั้ง 3 บทบาทได้ทันที*

---

## 4. รายการหน้าจอและโมดูลที่พัฒนาแล้ว

1. **หน้าเข้าสู่ระบบ (Login):**
   - รองรับการล็อกอินด้วย Username / Password
   - มีปุ่มทางลัดสลับ 3 บทบาท (Demo Personas) เพื่อความสะดวกรวดเร็วในการตรวจสอบ
2. **เวลาปฏิบัติงานของฉัน (My Attendance):**
   - สำหรับบุคลากรทั่วไป (และเป็นหน้าจอเดียวที่ `GENERAL_USER` เข้าถึงได้)
   - กรองตามเดือน แสดงตารางเวลาเข้า-ออกงาน, สถานะ (`NORMAL`, `LATE`, `NO_SCAN`), นาทีสาย และสรุปสถิติประจำเดือน
3. **แดชบอร์ดภาพรวม (Dashboard Overview):**
   - แสดง KPI: จำนวนบุคลากรที่ปฏิบัติงาน, จำนวนคนที่สาย (Distinct Person), จำนวนครั้งที่สาย (Late shifts), นาทีสายรวม และนาทีสายเฉลี่ยต่อกะที่สาย (แสดงตัวหารชัดเจน)
   - ตารางอันดับการมาสาย (สลับดู สายมาก→น้อย หรือ สายน้อย→มาก ได้)
   - สรุปสถิติตามฝ่าย/แผนก
4. **ตรวจสอบบันทึกเวลา & Reprocess (Attendance Review):**
   - ค้นหาชื่อ รหัสบุคลากร กรองตามสถานะ และแผนก
   - หน้าต่างบันทึกสาเหตุ `NO_SCAN` (ลาป่วย, ลากิจ, พักผ่อน, ไปราชการ, อบรม, หยุดเวร)
   - ฟังก์ชัน **Reprocess** คำนวณเวรย้อนหลังตามช่วงวันที่ โดยไม่ลบหมายเหตุหรือประวัติการส่งเดิม
   - หน้าต่างดู Raw Scan Trace ที่จับคู่กับรายการลงเวลา
5. **ข้อมูลสแกนดิบ (Raw Scans & Sync Runs):**
   - แสดงตารางข้อมูลดิบ 6 ฟิลด์ (`machineNo`, `enrollNumber`, `scanDateTime`, `verifyMode`, `inOutMode`, `workCode`)
   - ระบบตรวจสอบข้อมูลซ้ำ (Deduplication) ด้วย Composite Key
   - ประวัติรอบการ Sync (Sync Runs Log)
   - เอกสารสัญญา JSON Contract ตัวอย่างจริง
6. **จัดการเครื่องสแกน (Scanner Devices):**
   - รายการเครื่องสแกนประจำจุด: OPD (192.168.111.163), ER (192.168.111.164), อาคารบริหาร (192.168.111.165)
   - ปุ่มทดสอบการเชื่อมต่อ (Mock Test Connection) และปุ่มสั่ง Sync รายเครื่องหรือทุกเครื่อง
   - ตารางรอบเวลา Auto-Sync รายวัน (00:00 น. และ 08:00 น.)
7. **บุคลากร HOSOffice (Personnel Roster):**
   - รายชื่อบุคลากรที่ซิงค์มาจาก HOSOffice (Authoritative Source)
   - แสดง `PERSON_ID`, `FINGLE_ID`, ชื่อ-สกุล, ตำแหน่ง, แผนก, ประเภทบุคลากร
   - ปุ่มดึง/อัปเดตข้อมูลจาก HOSOffice
8. **ตารางเวร & การหมุนเวียน (Shift Management):**
   - กะเช้า (08:00-16:00), กะบ่าย (16:00-00:00), กะดึก (00:00-08:00), เวรราชการ (08:30-16:30)
   - แสดง Grace Period (15 นาที) และหน้าต่างเวลารับสแกน
   - ลำดับความสำคัญในการเลือกกะ: รายวัน > ประจำรายบุคคล > มาตรฐาน > NO_SCHEDULE
9. **รายงานสรุป & ส่งออก (Reports):**
   - รายงานสรุป รายวัน / รายเดือน / กำหนดช่วงวันที่
   - แยกจำนวนคนสาย (Distinct Persons) และจำนวนครั้งที่สาย
   - ส่งออกข้อมูลเป็นไฟล์ CSV (Export CSV)
10. **ส่งข้อมูลไป HOSOffice (HOSOffice Direct Push):**
    - ส่งข้อมูลได้โดยตรงไม่ต้องรอ Approval หลายขั้นตอน
    - เลือกรายการที่ต้องการส่ง และบันทึกประวัติการส่ง (Push History Log)
    - ป้องกันการส่งซ้ำด้วย Idempotency Key
    - แจ้งเตือนหากรายการถูกแก้ไขหลังจากส่งไปแล้ว
11. **ตั้งค่าระบบ (Settings & Connections):**
    - ตรวจสอบสถานะ Gateway Mount และฐานข้อมูล `samchuk_attendance`
    - ทดสอบการเชื่อมต่อฐานข้อมูล Sam_Att และ HOSOffice (Masked Credentials)
    - จัดการผู้ใช้งานและผูก `PERSON_ID`
12. **คู่มือ Central Gateway (Gateway Integration Guide):**
    - แนะนำสถาปัตยกรรมและโค้ดตัวอย่างการ Mount Sam_Att Router

---

## 5. โครงสร้าง Source Code ที่จัดเตรียมไว้

```
├── backend/
│   ├── controllers/               # Controller modules for future backend endpoints
│   ├── services/
│   │   ├── attendanceCalculator.ts # Deterministic late calculation & dedupe logic
│   │   └── scannerAdapter.ts       # 6-field JSON contract validator & parser
│   ├── types/                     # Shared backend TypeScript contracts
│   └── router.ts                  # Mountable Express Router for Central API Gateway (Port 3002)
├── database/
│   └── schema.sql                 # DDL migration for database `samchuk_attendance` (12 tables)
├── src/
│   ├── components/
│   │   ├── common/                # Reusable UI widgets (StatusBadge, etc.)
│   │   └── layout/                # Navbar, Sidebar, Persona Switcher
│   ├── context/
│   │   └── AuthContext.tsx        # Authentication & Role state management
│   ├── mock/
│   │   └── mockData.ts            # Realistic hospital mock data (Staff, Scans, Shifts)
│   ├── services/
│   │   └── mockAttendanceService.ts # Client mock service simulating backend engine
│   ├── types/
│   │   └── attendance.ts          # Core domain types
│   ├── views/                     # All 12 application view screens
│   ├── App.tsx                    # Main layout & role authorization guard
│   ├── index.css                  # Tailwind styles & Thai font definitions
│   └── main.tsx                   # React root mount
├── GATEWAY_INTEGRATION.md         # Guide for Samchuk Central API Gateway mounting
├── SCANNER_CONTRACT.md            # Detailed 6-field scanner contract specifications
├── vite.config.ts                 # Vite bundler config with base path support
├── package.json                   # Dependencies
└── README.md                      # This documentation
```

---

## 6. วิธีติดตั้งและรันเพื่อการพัฒนา (Development & Testing)

### 6.1 ติดตั้ง Dependencies
```bash
npm install
```

### 6.2 รันเซิร์ฟเวอร์สำหรับพัฒนา (Development Server)
```bash
npm run dev
```
เข้าใช้งานผ่านเบราว์เซอร์: `http://localhost:3000` (หรือพอร์ตที่ระบบระบุ)

### 6.3 วิธีทดสอบระบบด้วย Mock Data
1. **ทดสอบ 3 บทบาทสิทธิ์:**
   - ใช้แถบสีส้มด้านบนสุด หรือหน้า Login เพื่อคลิกสลับบทบาท:
     * คลิก **พญ.สุดารัตน์ (User)**: สังเกตว่าเมนูด้านซ้ายจะเหลือเฉพาะ "เวลาปฏิบัติงานของฉัน" เท่านั้น ไม่สามารถดูข้อมูลผู้อื่นได้
     * คลิก **จนท.ลงเวลา (Staff)**: สามารถดูแดชบอร์ด, ตรวจสอบเวลาทุกคน, บันทึกสาเหตุ NO_SCAN, Reprocess และกดส่ง HOSOffice
     * คลิก **แอดมิน (Admin)**: เพิ่มสิทธิ์ในการจัดการเครื่องสแกนและตั้งค่าฐานข้อมูล
2. **ทดสอบ Deduplication สแกนดิบ:**
   - ไปที่หน้า **ข้อมูลสแกนดิบ** หรือ **จัดการเครื่องสแกน** แล้วกด **"จำลองการดึงสแกน (Sync Scanners Mock)"**
   - สังเกตผลลัพธ์ว่าระบบตรวจพบรายการซ้ำ (Duplicate) และบันทึกเฉพาะรายการใหม่โดยไม่สร้าง Record ซ้ำ
3. **ทดสอบ Reprocess:**
   - ไปที่หน้า **ตรวจบันทึกเวลา & Reprocess** แล้วกด **"ประมวลผลย้อนหลัง (Reprocess)"**
   - ตรวจสอบว่าระบบคำนวณเวรใหม่โดยคงหมายเหตุเดิมไว้ครบถ้วน
4. **ทดสอบ Export CSV:**
   - ไปที่หน้า **รายงานสรุป** แล้วกด **"ส่งออกไฟล์ CSV"** เพื่อดาวน์โหลดรายงาน

---

## 7. ส่วนที่ยังรอเชื่อมต่อในรอบถัดไป (Pending Integrations)

เนื่องจากรอบนี้เป็น **Phase A (UI Prototype & Architecture)** จึงยังไม่มีการเชื่อมต่อระบบจริง:
1. **Central API Gateway จริง:** รอตรวจสอบ Source Code ของ Gateway โรงพยาบาลสามชุกก่อนนำ `backend/router.ts` ไป Mount บน Port 3002
2. **Scanner Reader EXE เดิม:** รอตรวจสอบพาธของไฟล์ EXE และการส่งค่าพารามิเตอร์บนเซิร์ฟเวอร์จริงของโรงพยาบาล
3. **ฐานข้อมูล `samchuk_attendance` จริง:** รอสร้างฐานข้อมูลบน Database Server ของโรงพยาบาลและรัน `database/schema.sql`
4. **HOSOffice Database จริง:** รอการกำหนด Connection String และสิทธิ์การอ่านตารางบุคลากรและการบันทึกเวลาจริง

---

## 8. ขั้นตอนการดำเนินการต่อ (Next Steps)

1. นำ Source Code ชุดนี้ขึ้น **GitHub Repository**
2. ส่ง Repository ให้ **ChatGPT ตรวจสอบ Code Review** ตามเกณฑ์ใน MASTER DEVELOPMENT PROMPT
3. ปรับปรุงแก้ไขตามผลการตรวจสอบ
4. เมื่อผ่านการตรวจสอบแล้ว จึงขอรับ Source Code ของ Central API Gateway จริงมาตรวจสอบร่วมกันเพื่อเตรียมพร้อมสำหรับการ Deploy จริง

# คู่มือการเชื่อมต่อ Samchuk Hospital Central API Gateway
## ระบบ Sam_Att V2 (Samchuk Hospital Attendance Management System)

เอกสารนี้ระบุข้อกำหนดในการนำระบบ Sam_Att V2 เข้าไปเชื่อมต่อและทำงานร่วมกับ **Samchuk Hospital Central API Gateway เดิม** โดยไม่สร้าง Gateway ใหม่ และไม่เปิดพอร์ตระบบเพิ่มเติม

---

### 1. สถาปัตยกรรมที่กำหนด (Mandatory Architecture)

| ส่วนประกอบ | รายละเอียด | หมายเหตุ |
| :--- | :--- | :--- |
| **Frontend Web** | HTTPS พอร์ต `3001` ภายใต้ URL Prefix `/Sam_Att/` | Reverse Proxy / IIS จัดเส้นทางมายัง Frontend build |
| **Backend API** | Central API Gateway พอร์ต `3002` ภายใต้ Prefix `/api/Sam_Att/` | **ใช้ Shared HTTP Listener เดิมตัวเดียว** |
| **Database** | ฐานข้อมูลชื่อ `samchuk_attendance` | **แยกเด็ดขาด** ไม่ใช้ตารางร่วมกับระบบอื่น |
| **ระบบอื่นที่อยู่ร่วม** | `Procurement` (`/Procurement/`, `/api/Procurement/`)<br/>`Cash_Cheque` (`/Cash_Cheque/`, `/api/Cash_Cheque/`) | **ห้ามแก้ไขหรือกระทบกระเทือนเด็ดขาด** |

---

### 2. ข้อห้ามสำคัญ (Critical Constraints)

1. **ห้ามสร้าง HTTP Listener ใหม่:**
   - Sam_Att Backend เป็น **Modular Router** เท่านั้น
   - **ห้ามเรียก `app.listen()` หรือ `server.listen()` ในโค้ดของ Sam_Att**
   - ห้ามเปิดพอร์ต 3003, 3004 หรือพอร์ตอื่นบนเซิร์ฟเวอร์
2. **ห้ามนำข้อมูลไปเก็บปะปนกับฐานข้อมูลของ Procurement หรือ Cash_Cheque:**
   - ใช้ Database connection แยกไปยังฐานข้อมูล `samchuk_attendance`
3. **การเข้าถึงฐานข้อมูลและเครื่องสแกน:**
   - เป็นการเชื่อมต่อไปยังบริการภายนอกจาก Backend
   - ห้ามเก็บ Database credentials ในฝั่ง Frontend

---

### 3. ตัวอย่างการ Mount Sam_Att Modular Router ใน Central API Gateway

เมื่อได้รับ Source Code ของ Central API Gateway โรงพยาบาลสามชุก ให้นำ Router ไป Mount ดังนี้:

```typescript
// =====================================================================
// ไฟล์ Gateway หลัก (เช่น src/app.ts หรือ src/gateway.ts บน Port 3002)
// =====================================================================
import express from 'express';
// นำเข้าโมดูลที่มีอยู่เดิมของโรงพยาบาล (ห้ามแก้ไข logic เดิม)
import { procurementRouter } from './modules/procurement';
import { cashChequeRouter } from './modules/cash_cheque';

// นำเข้า Sam_Att V2 Modular Router
import { samAttRouter } from './modules/sam_att/backend/router';

const app = express();

app.use(express.json());

// 1. ระบบที่มีอยู่เดิมของโรงพยาบาลสามชุก
app.use('/api/Procurement', procurementRouter);
app.use('/api/Cash_Cheque', cashChequeRouter);

// 2. ระบบ Sam_Att V2 ที่เพิ่มเข้าไปใหม่
app.use('/api/Sam_Att', samAttRouter);

// Central API Gateway รัน HTTP Listener เพียงตัวเดียวบน Port 3002
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`[Central API Gateway] Running on port ${PORT}`);
  console.log(` - Procurement: /api/Procurement/`);
  console.log(` - Cash_Cheque: /api/Cash_Cheque/`);
  console.log(` - Sam_Att:      /api/Sam_Att/`);
});
```

---

### 4. รายการ API Endpoints ภายใต้ `/api/Sam_Att/`

| HTTP Method | เส้นทาง API | คำอธิบาย | สิทธิ์ที่เข้าถึงได้ |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/Sam_Att/auth/login` | ตรวจสอบชื่อผู้ใช้และรหัสผ่าน | ทุกคน |
| `GET` | `/api/Sam_Att/auth/me` | ตรวจสอบข้อมูลผู้ใช้งานและสิทธิ์ปัจจุบัน | ผู้ที่ล็อกอินแล้ว |
| `GET` | `/api/Sam_Att/me/attendance` | ข้อมูลการลงเวลาเฉพาะของตนเอง (derive personId) | ทุกคนที่ผูก PERSON_ID |
| `GET` | `/api/Sam_Att/dashboard/summary` | สรุป KPI การลงเวลาประจำวัน/ช่วงเวลา | STAFF, ADMIN |
| `GET` | `/api/Sam_Att/reports/lateness` | รายงานและอันดับการมาสาย | STAFF, ADMIN |
| `GET` | `/api/Sam_Att/personnel` | บัญชีรายชื่อบุคลากร HOSOffice | STAFF, ADMIN |
| `POST` | `/api/Sam_Att/personnel/sync` | ดึง/อัปเดตบุคลากรจาก HOSOffice | STAFF, ADMIN |
| `GET` | `/api/Sam_Att/shifts` | รายการกะการทำงานและช่วงเวลา | STAFF, ADMIN |
| `GET` | `/api/Sam_Att/scanners` | รายการเครื่องสแกนและสถานะ | STAFF, ADMIN |
| `POST` | `/api/Sam_Att/scanners/sync` | รับผลลัพธ์ JSON 6 ฟิลด์จาก Scanner Reader EXE | STAFF, ADMIN |
| `GET` | `/api/Sam_Att/raw-scans` | ดูข้อมูลสแกนดิบ (Immutable Read-Only) | STAFF, ADMIN |
| `GET` | `/api/Sam_Att/attendance` | ดูตารางเวลาปฏิบัติงานบุคลากรทั้งหมด | STAFF, ADMIN |
| `POST` | `/api/Sam_Att/attendance/reprocess` | คำนวณเวลาใหม่ย้อนหลัง (Reprocess) | STAFF, ADMIN |
| `POST` | `/api/Sam_Att/attendance/:id/notes` | บันทึกสาเหตุไม่พบสแกน (NO_SCAN) | STAFF, ADMIN |
| `POST` | `/api/Sam_Att/hosoffice/push` | ส่งผลเวลาไปยัง HOSOffice โดยตรง | STAFF, ADMIN |
| `GET` | `/api/Sam_Att/hosoffice/push-history` | ดูประวัติการส่งข้อมูลไป HOSOffice | STAFF, ADMIN |
| `GET` | `/api/Sam_Att/settings/connections` | ดูค่าการเชื่อมต่อ DB / HOSOffice (Masked) | ADMIN เท่านั้น |

---

### 5. การตรวจสอบ Gateway จริงก่อนเชื่อมต่อ (Checklist)

เมื่อผู้ใช้นำ Source Code ของ Central API Gateway จริงมาเชื่อมต่อ ให้ตรวจสอบสิ่งต่อไปนี้:
- [ ] โครงสร้างโปรเจกต์ Gateway และตำแหน่งไฟล์ Module Registry
- [ ] วิธีจัดการ Middleware Authentication (JWT / Session / Bearer Token)
- [ ] Environment Variables และ Secret Store ที่ใช้
- [ ] Database Connection Pool สำหรับ `samchuk_attendance`
- [ ] การตั้งค่า IIS Application / Reverse Proxy บน Port 3001 (`/Sam_Att/`) และ Port 3002 (`/api/Sam_Att/`)
- [ ] ทดสอบว่าไม่มีการกระทบกระเทือนต่อ Procurement และ Cash_Cheque

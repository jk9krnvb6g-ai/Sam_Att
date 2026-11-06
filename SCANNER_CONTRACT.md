# สัญญาข้อมูลดิบเครื่องสแกนนิ้ว (Scanner Raw JSON Contract)
## โรงพยาบาลสามชุก — Sam_Att V2

เอกสารนี้กำหนดข้อตกลงข้อมูล (Data Contract) ระหว่าง **โปรแกรม Scanner Reader EXE ตัวเดิมของโรงพยาบาล** กับ **ระบบ Sam_Att Backend** ตามข้อกำหนดใน **MASTER DEVELOPMENT PROMPT §4.5, §4.6 และ §14**

---

### 1. ข้อกำหนดหลัก (Core Principles)

1. **ใช้ Scanner Reader EXE ตัวเดิมที่โรงพยาบาลมีอยู่:**
   - ห้ามสร้าง แก้ไข หรือเปลี่ยนตัว EXE
   - ห้ามสั่งให้ผู้พัฒนา EXE แก้ไขรูปแบบ JSON เพื่อความสะดวกของ Sam_Att
2. **ห้ามเปลี่ยนชื่อฟิลด์ `enrollNumber` เป็น `fingleId`:**
   - โปรแกรม EXE ส่งฟิลด์ชื่อ `enrollNumber` เสมอ
   - Sam_Att Backend จะเป็นผู้แปลง/Normalize เพื่อจับคู่กับ `FINGLE_ID` ในฐานข้อมูล HOSOffice
3. **รูปแบบเวลา `scanDateTime`:**
   - ตัวอย่างจริงเป็นรูปแบบ `yyyy-MM-dd HH:mm:ss` (ตามเวลาเครื่องสแกนในเขตเวลาไทย `Asia/Bangkok`)
   - ไม่บังคับให้ EXE เปลี่ยนเป็น ISO timestamp แบบมี `T` หรือ `Z`
4. **ความหมายของโหมดการสแกน:**
   - `verifyMode` และ `inOutMode` เป็นค่าตัวเลขดิบที่อุปกรณ์ส่งมา เก็บเป็นค่าตัวเลขตามเดิม
   - `workCode` รองรับค่าที่เป็นตัวเลขหรือ `null`

---

### 2. ตัวอย่าง JSON Payload ที่ EXE เดิมส่งออก (Confirmed Contract)

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

---

### 3. รายละเอียดฟิลด์ทั้ง 6 ใน `scans[]`

| ชื่อฟิลด์ | ชนิดข้อมูล | ค่าตัวอย่าง | คำอธิบาย |
| :--- | :--- | :--- | :--- |
| `machineNo` | Number (Integer) | `1` | หมายเลขประจำเครื่องสแกน (เช่น 1 = OPD, 2 = ER, 3 = บริหาร) |
| `enrollNumber` | Number (Integer) | `54` | รหัสนิ้วมือที่บันทึกในเครื่อง (ใช้จับคู่กับ FINGLE_ID ใน HOSOffice) |
| `scanDateTime` | String | `"2026-11-06 07:45:00"` | วันเวลาที่สแกนตามนาฬิกาของเครื่อง (`yyyy-MM-dd HH:mm:ss`) |
| `verifyMode` | Number (Integer) | `268435456` | โหมดการยืนยันตัวตนจากฮาร์ดแวร์ (เช่น สแกนนิ้ว, รหัสผ่าน, คีย์การ์ด) |
| `inOutMode` | Number (Integer) | `1` | สถานะเข้า-ออกที่ถูกเลือกบนเครื่องสแกน (1 = เข้า, 2 = ออก) |
| `workCode` | Number or null | `null` | รหัสประเภทงานพิเศษจากเครื่อง (รองรับค่าว่าง) |

---

### 4. การจัดการข้อมูลซ้ำ (Deduplication)

- Sam_Att Backend กำหนด Composite Unique Key สำหรับข้อมูลสแกนดิบในตาราง `raw_scans`:
  $$\text{dedupe\_key} = \text{machineNo} + \text{"\_"} + \text{enrollNumber} + \text{"\_"} + \text{scanDateTime}$$
- เมื่อมีการ Sync ซ้ำหรืออ่านข้อมูลชุดเดิม:
  - ฐานข้อมูลจะปฏิเสธการบันทึกรายการซ้ำ (`ON CONFLICT DO NOTHING`)
  - ไม่เกิด record ซ้ำใน `raw_scans`
  - Backend จะนับจำนวนรายการซ้ำ (duplicateScans) และบันทึกลง `sync_runs` log เพื่อการตรวจสอบ

---

### 5. การประมวลผลตารางเวลาอัตโนมัติ (Attendance Calculation)

1. **เมื่อพบการสแกนใหม่:** Backend จะค้นหาบุคลากรใน `personnel` ที่มี `FINGLE_ID == enrollNumber`
2. **หากพบบุคลากรและตารางเวร:** คำนวณเวลาเข้า/ออก สถานะ (`NORMAL` หรือ `LATE`) และนาทีสายทันที:
   $$\text{lateMinutes} = \max(0, \text{actualCheckIn} - \text{shiftStart} - \text{graceMinutes})$$
3. **หากยังไม่พบบุคลากรที่ตรงกัน:** บันทึก Raw Scan ไว้ตามเดิม และตั้งสถานะเป็น `PENDING_MAPPING` รอการกด **Reprocess** เมื่ออัปเดตข้อมูลบุคลากรแล้ว

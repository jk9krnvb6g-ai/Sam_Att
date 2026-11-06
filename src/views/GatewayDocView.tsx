import React from 'react';
import {
  Server,
  ShieldCheck,
  Code,
  CheckCircle2,
  AlertTriangle,
  FolderTree,
  ExternalLink,
} from 'lucide-react';

export const GatewayDocView: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          คู่มือการเชื่อมต่อ Samchuk Hospital Central API Gateway
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          เอกสารข้อกำหนดสถาปัตยกรรม Gateway Integration สำหรับนำขึ้น GitHub เพื่อ Review และเตรียมเชื่อมต่อจริง
        </p>
      </div>

      {/* Primary Rules Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Server className="w-4 h-4 text-teal-600" />
          1. สถาปัตยกรรมระบบ (Architecture Constraints)
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="font-bold text-slate-900 block mb-1">Frontend HTTPS Port 3001</span>
            <p className="text-slate-600 leading-relaxed">
              ทำงานภายใต้ URL Prefix <code className="text-teal-700 font-bold">/Sam_Att/</code> โดย Vite config
              และ router รองรับ base path นี้อย่างถูกต้อง
            </p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="font-bold text-slate-900 block mb-1">Central API Gateway Port 3002</span>
            <p className="text-slate-600 leading-relaxed">
              แชร์ HTTP Listener ตัวเดิมของโรงพยาบาลสามชุก mount Sam_Att router ไว้ที่{' '}
              <code className="text-teal-700 font-bold">/api/Sam_Att/</code> <strong>ห้ามเปิดพอร์ตใหม่</strong>
            </p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="font-bold text-slate-900 block mb-1">ฐานข้อมูลแยก samchuk_attendance</span>
            <p className="text-slate-600 leading-relaxed">
              ไม่ปะปนกับระบบ Procurement หรือ Cash_Cheque และไม่แก้ไข Business logic ของทั้งสองระบบ
            </p>
          </div>
        </div>
      </div>

      {/* Gateway Mounting Code Snippet */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Code className="w-4 h-4 text-slate-700" />
          2. ตัวอย่างการ Mount Sam_Att Router ใน Central API Gateway
        </div>
        <p className="text-xs text-slate-500">
          ไฟล์ <code className="font-mono text-teal-700">backend/router.ts</code> ส่งออกโมดูลาร์เราเตอร์พร้อมติดตั้งใน Gateway
        </p>

        <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
          <pre>{`// ใน server.js หรือ gateway index ของ Central API Gateway (Port 3002)
import express from 'express';
import { samAttRouter } from './modules/Sam_Att/router';
// import { procurementRouter } from './modules/Procurement/router';
// import { cashChequeRouter } from './modules/Cash_Cheque/router';

const app = express();

// ติดตั้งระบบเดิม (ห้ามกระทบกระเทือน)
// app.use('/api/Procurement', procurementRouter);
// app.use('/api/Cash_Cheque', cashChequeRouter);

// ติดตั้ง Sam_Att V2 ภายใต้ Prefix ที่กำหนด
app.use('/api/Sam_Att', samAttRouter);

// Central API Gateway รันบนพอร์ต 3002 ตัวเดียว
// app.listen(3002, () => console.log('Central Gateway running on port 3002'));`}</pre>
        </div>
      </div>

      {/* Scanner EXE Integration Contract */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
          3. การเชื่อมต่อเครื่องสแกนผ่าน EXE เดิม (6 Fields Contract)
        </div>
        <p className="text-xs text-slate-600">
          Backend Service เป็นผู้รัน EXE เดิมฝั่ง Server อย่างปลอดภัย และรับผลลัพธ์ JSON 6 ฟิลด์:
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
          <div className="p-2 bg-slate-50 border border-slate-200 rounded">
            <span className="font-bold text-slate-800">1. machineNo</span>
            <span className="block text-[11px] text-slate-500 font-sans">หมายเลขเครื่องสแกน (1, 2, 3)</span>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-200 rounded">
            <span className="font-bold text-teal-700">2. enrollNumber</span>
            <span className="block text-[11px] text-slate-500 font-sans">รหัสนิ้วมือ (ห้ามเปลี่ยนเป็น fingleId)</span>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-200 rounded">
            <span className="font-bold text-slate-800">3. scanDateTime</span>
            <span className="block text-[11px] text-slate-500 font-sans">รูปแบบ yyyy-MM-dd HH:mm:ss</span>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-200 rounded">
            <span className="font-bold text-slate-800">4. verifyMode</span>
            <span className="block text-[11px] text-slate-500 font-sans">ค่าตัวเลขดิบจากเครื่อง</span>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-200 rounded">
            <span className="font-bold text-slate-800">5. inOutMode</span>
            <span className="block text-[11px] text-slate-500 font-sans">1 (เข้า) / 2 (ออก) จากเครื่อง</span>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-200 rounded">
            <span className="font-bold text-slate-800">6. workCode</span>
            <span className="block text-[11px] text-slate-500 font-sans">รองรับค่า null</span>
          </div>
        </div>
      </div>

      {/* GitHub Review Loop Steps */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <FolderTree className="w-4 h-4 text-slate-700" />
          4. ขั้นตอนการ Review บน GitHub ตาม MASTER PROMPT Phase C
        </div>
        <ol className="list-decimal list-inside space-y-2 text-xs text-slate-700">
          <li>
            <strong>Push Source Code ขึ้น GitHub:</strong> ตรวจสอบว่ามีโครงสร้าง frontend, backend router, database schema, และ mock adapter ครบถ้วน
          </li>
          <li>
            <strong>ส่งให้ ChatGPT ตรวจสอบ:</strong> ตรวจสอบสิทธิ์ 3 บทบาท, การคำนวณสาย, กะข้ามวัน, Deduplication 6 ฟิลด์ และ Gateway architecture
          </li>
          <li>
            <strong>แก้ไขตามข้อเสนอแนะ:</strong> ปรับปรุงข้อบกพร่องตามระดับความสำคัญ (Critical / High / Medium / Low)
          </li>
          <li>
            <strong>ตรวจ Source Code ของ Gateway จริงร่วมกัน:</strong> เมื่อผ่านการรีวิว จึงนำโค้ด Gateway จริงของ รพ.สามชุก มาตรวจก่อน mount ในโปรดักชัน
          </li>
        </ol>
      </div>
    </div>
  );
};

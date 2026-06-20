# CTPA EHS Manhour Record & Safety KPI

Web app สำหรับบันทึก **Manpower / Working Hours รายวัน** และคำนวณ **Safety KPI** อัตโนมัติ
สำหรับโครงการก่อสร้าง Data Center — **CTPA BKK22, Chonburi Tech Park** ที่มีผู้รับเหมาหลายเจ้า
แยกตาม Building, ประเภทงาน และกิจกรรมประจำวัน

ใช้งานได้ทั้งมือถือและ Desktop · ข้อมูลบันทึกบน **Supabase** จริง · **sync ทุกอุปกรณ์แบบเรียลไทม์**

---

## ✨ ฟีเจอร์ (ตาม spec)

| # | Module | รายละเอียด |
|---|--------|-----------|
| 1 | **Daily Manpower & Working Hours** | ฟอร์มบันทึกรายวันครบทุก field (Date, Contractor/Sub, Building, Work Type, Activity, Day/Night shift, Male/Female, Working/OT hours, High Risk, Remark, Submitted by) + ตารางแก้ไข/ลบ |
| 2 | **Safety KPI Dashboard** | Total/Accumulative/Rolling-Year manhours, Observations + rate /250,000, First Aid, Medical Treatment, LTI, Recordable, Near Miss, **TRIR**, **LTIR**, Days without LTI + กราฟแนวโน้ม |
| 2b | **Statistics — Incidents & Events Dashboard** | Leading/Lagging indicators (Last Period vs Cumulative), **Type A/B incident classification**, WPS, Loss of Consciousness, TRIR/LTIR/WPS Rate + targets, auto color status (เขียว/เหลือง/แดง), pie/trend charts, Top-5, **Benchmark vs Industry + Variance %**, filter Week/Month/Contractor/Building/Work Type, Export Excel/PDF Weekly EHS Report |
| 3 | **Contractor Summary** | สรุปตาม Contractor: Manpower, Working Hours, High Risk, Incidents, Recordable, KPI Performance |
| 4 | **Building / Area Summary** | สรุปตามพื้นที่ + กราฟ Working Hours/Manpower รายวัน |
| 5 | **Work Type Summary** | filter & สรุปตามประเภทงาน (Civil, Electrical, Lifting, WAH, Hot Work, Confined Space, ฯลฯ) |
| 6 | **Import / Export** | Import Excel template, Export Excel (พร้อมใช้งาน), Export **PDF** Weekly Safety KPI Report, (PowerPoint — roadmap) |
| 7 | **User Role** | Admin / EHS Manager / Contractor Safety / Viewer (โมเดล login น้ำหนักเบา: รหัสผ่านร่วม + เลือก role) |
| 8 | **Database** | Supabase — ตาราง `mh_*` (ดูด้านล่าง) |
| 9 | **UI** | โทนขาว + เขียว `#00CC79`, mobile-first, filter bar ด้านบน (Date range, Contractor, Building, Work Type, Shift) |

---

## 🧱 สถาปัตยกรรม

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Supabase** (PostgreSQL + Realtime) — client-side ผ่าน publishable key + Row Level Security
- **Recharts** (กราฟ) · **SheetJS/xlsx** (Excel) · **jsPDF + autotable** (PDF) — โหลดแบบ lazy เพื่อความเร็วบนมือถือ
- Deploy บน **Vercel**

> ใช้ Supabase project เดียวกับระบบ **CTPA Observation Tracking** (ฟรี) แต่ **แยกตารางทั้งหมดด้วย prefix `mh_`**
> ระบบเดิม (`observations`, `ctpa_state`, `ctpa_log`) **ไม่ถูกแตะต้อง** — Dashboard เพียงแค่ "อ่าน" จำนวน Observation มาแสดงในช่อง KPI เท่านั้น

### ตารางฐานข้อมูล (ใหม่ทั้งหมด)
```
mh_contractors      ผู้รับเหมาหลัก (GC / Contractor / Sub)
mh_subcontractors   ผู้รับเหมาช่วง
mh_buildings        Building / Area / Facility
mh_work_types       ประเภทงาน (+ flag high_risk)
mh_users            รายชื่อผู้ใช้ + บทบาท
mh_daily_workhours  บันทึกรายวัน (total_manpower & total_manhours เป็น generated column)
mh_incidents        อุบัติการณ์ (ใช้คำนวณ TRIR/LTIR/Days without LTI)
mh_settings         ตั้งค่า KPI basis, baseline, targets, รหัสผ่าน (jsonb)
mh_audit_log        บันทึกการใช้งาน
```

### ตรรกะการคำนวณ KPI (`lib/kpi.ts`)
- `Total Man-hours = Σ manpower × (working_hours + ot_hours)`
- `TRIR = Recordable × 200,000 / Total Workhours`  (เป้าหมาย ≤ 0.20)
- `LTIR = LTI × 1,000,000 / Total Workhours`
- `WPS Rate = Lost Workdays / Recordable Cases`  (เป้าหมาย ≤ 0.15)
- `Observation Rate = Observations × 250,000 / Man-hours`
- `Days without LTI = วันนี้ − วันที่เกิด LTI ล่าสุด`
- Recordable = Medical Treatment + Restricted Work + LTI + Fatality · LTI = LTI + Fatality
- Type A/B = การจำแนกกลไกการเกิดเหตุ (CFSE, VEH, FFH … STF, PA) เก็บใน `mh_incidents.type_code`
- ค่า basis/target/benchmark ปรับได้ที่ **Admin → KPI Settings**

---

## 🔐 การเข้าใช้งาน (ค่าเริ่มต้น — แนะนำให้เปลี่ยนใน Admin → KPI Settings)
- **รหัสผ่านร่วม (เข้าใช้งาน):** `ctpa2026`
- **Admin PIN** (สำหรับ role Admin / EHS Manager): `2580`

สิทธิ์:
- **Admin** — แก้ไข/ลบ/จัดการข้อมูลหลัก/Export/ตั้งค่า
- **EHS Manager** — เพิ่ม/แก้ไข/ลบ/Export
- **Contractor Safety** — เพิ่ม/แก้ไขข้อมูลของบริษัทตัวเอง (ถูกล็อก contractor)
- **Viewer** — ดูอย่างเดียว

---

## 🚀 รันบนเครื่อง
```bash
npm install
npm run dev        # http://localhost:3000
```
`.env.local` (มีค่า default ฝังในโค้ดอยู่แล้ว หากไม่ตั้งก็ใช้งานได้):
```
NEXT_PUBLIC_SUPABASE_URL=https://ocwdnvblpjfzkgzratqb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_4Vm__otNg0T3iEV8_ni43Q_vhA1-_tt
NEXT_PUBLIC_SITE_ID=bkk22
```

## ☁️ Deploy
Deploy อัตโนมัติบน Vercel (push branch → preview/production)

## 🧪 ทดลองใช้
เข้า **Admin → เครื่องมือ → โหลดข้อมูลตัวอย่าง 14 วัน** เพื่อให้ Dashboard มีข้อมูลทดสอบ
(ลบออกได้ด้วยปุ่ม "ลบข้อมูลตัวอย่าง" — ไม่กระทบข้อมูลจริง)

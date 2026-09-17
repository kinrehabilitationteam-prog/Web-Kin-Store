# Deploy บน Vercel

- Framework Preset: Other
- Root Directory: `./`
- ปิด Override ของ Build Command, Output Directory, Install Command และ Development Command ใช้ `vercel.json` ใน repository
- Node.js: 24.x
- Push commit ที่มี `api/index.js`, `vercel.json` และโค้ดที่แก้ไปยัง branch ที่ Vercel ใช้ แล้ว Deploy ใหม่ การ Redeploy commit เก่าจะไม่รวมโค้ดใหม่

Environment Variables (Production): `DATABASE_URL` ของ Neon, `ADMIN_PASSWORD` อย่างน้อย 12 ตัวอักษร, `PAYMENT_PROVIDER=paysolutions`, `PUBLIC_URL=https://โดเมนจริง`, `COOKIE_SECURE=true` และ `PAYSOLUTIONS_*` ทั้งสี่ค่า ระบบจะไม่เปิด payment หากตั้งค่าไม่ครบ ห้ามใช้ demo ใน production อย่าส่ง `.env` ขึ้น Git

Vercel เรียก HTTP handler ผ่าน Function เดียว ทุก route รวม `/`, `/admin`, `/api/*` จึงใช้ routing และการตรวจสิทธิ์เดิม รูปภาพอัปโหลดเก็บในฐานข้อมูล ใช้ public assets จาก bundle ไม่ใช้ SQLite บน Vercel และไม่รัน seed ข้อมูลทุก cold start

ตรวจหลัง deploy: `/` ต้องแสดงร้าน, `/api/products` ต้องส่ง JSON, `/admin` ต้องเข้าสู่หน้าล็อกอิน, `/api/commerce/config` ต้องระบุ provider ที่ตั้งไว้

ข้อจำกัดที่ต้องจัดการก่อนเปิดร้านเต็มรูปแบบ: session ผู้ดูแลและ rate limit ปัจจุบันอยู่ใน memory จึงอาจหลุดเมื่อ instance เปลี่ยน ต้องย้ายไป shared storage; ตัวกวาด order หมดอายุด้วย timer ไม่รันบน serverless ต้องเพิ่ม scheduled job แยก การตรวจสถานะผ่าน postback/ปุ่มตรวจสอบยังทำงานตามเดิม และรายการ Pay Solutions ที่เริ่มชำระแล้วจะไม่คืนสต็อกเพียงเพราะหมดเวลาในเครื่อง

อ้างอิง: https://vercel.com/docs/functions/runtimes/node-js และ https://vercel.com/docs/project-configuration/vercel-json

# BAAN — Web Product Catalog

เว็บแค็ตตาล็อกสินค้าภาษาไทยตาม Flowchart: หน้าแรก → ค้นหา / เลือกหมวดหมู่ → รายการสินค้า (PLP) → รายละเอียดสินค้า (PDP) และหลังบ้านเพิ่ม แก้ไข ลบสินค้า/หมวดหมู่

## เริ่มใช้งาน

ต้องมี Node.js 24 ขึ้นไป

```powershell
npm install
Copy-Item .env.example .env
node scripts/setup-local.mjs
npm start
```

ถ้ามี `.env` อยู่แล้ว ให้ข้ามคำสั่ง Copy-Item เพื่อรักษาค่าที่ตั้งไว้

- หน้าร้าน: http://127.0.0.1:3000
- สินค้าทั้งหมด: http://127.0.0.1:3000/catalog
- หลังบ้าน: http://127.0.0.1:3000/admin
- Login ผู้ดูแล: http://127.0.0.1:3000/admin/login
- ตะกร้า: http://127.0.0.1:3000/cart
- คำสั่งซื้อ: http://127.0.0.1:3000/orders
- คำสั่งซื้อทั้งหมดสำหรับผู้ดูแล: http://127.0.0.1:3000/admin/orders
- รหัสผ่านผู้ดูแล: ค่า `ADMIN_PASSWORD` ใน `.env` (สคริปต์ setup สุ่มให้เฉพาะเมื่อยังไม่มีรหัสผ่าน)
- เปลี่ยนรหัสผ่านใน `.env` แล้วเริ่มแอปใหม่ รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร
- `npm run dev` เปิดโหมดเริ่มเซิร์ฟเวอร์ใหม่เมื่อแก้โค้ดฝั่งเซิร์ฟเวอร์

โหมดเริ่มต้นใช้ SQLite ที่ `data/catalog.sqlite` ข้อมูลคงอยู่หลังปิดแอป เมื่อฐานข้อมูลว่างจะสร้างสินค้าอุปกรณ์การแพทย์ 19 รายการใน 5 หมวดหมู่จากชุดข้อมูล KIN รูปอยู่ใน `public/assets/kin/` ส่วนสินค้าตัวอย่างเดิมใช้เฉพาะ test fixture ใน `tests/fixtures/demo-seed.js`

## แค็ตตาล็อก KIN HomeCare

นำเข้าข้อมูลจาก [แค็ตตาล็อกเช่าอุปกรณ์การแพทย์ KIN](https://kinrehab.com/kin_medical_equipment_rental) วันที่ 16 กันยายน 2026 จำนวน 19 รายการ (AR-200 และ Elevating แสดงเป็นตัวเลือกในรายการเดียว) พร้อมรูป สเปกที่เรียบเรียงจากข้อมูลต้นทาง ราคาเช่าแต่ละระยะเวลา เงินมัดจำ และเงื่อนไขจัดส่ง

- แหล่งข้อมูลที่จัดโครงสร้างแล้ว: `src/infrastructure/kin-catalog.js`
- หมวดหมู่: เตียงผู้ป่วย / รถเข็น / อุปกรณ์ช่วยเดินและเคลื่อนย้าย / ที่นอนและอุปกรณ์ข้างเตียง / อุปกรณ์ทางเดินหายใจ
- รูปสินค้าเก็บในเครื่อง ไม่ใช้ hotlink ภายนอก มีบันทึก URL รูปต้นทางที่ `data/kin-image-provenance.json`
- ราคาในรายการเป็น **ค่าเช่าเริ่มต้นตามรอบที่แสดง** ไม่ใช่ราคาซื้อขาด ไม่รวมมัดจำและค่าจัดส่งที่อาจมี ราคาสัญญาระยะยาวและตัวเลือกที่นอนอยู่ในตารางรายละเอียด
- ต้นทางไม่ระบุจำนวนคงเหลือ จึงเก็บ stock=0 และแสดง “สอบถามความพร้อม” พร้อมโทร/LINE ไม่มีการสร้างสต็อกสมมติ รายการเหล่านี้เป็น `purchaseMode: inquiry` ทั้ง quote และ checkout จะปฏิเสธการคิดค่าเช่าเป็นราคาขาย แม้มีการแก้ stock ผ่านหลังบ้าน ระบบ Cart/Payment สำหรับสินค้าขายปกติยังอยู่
- รุ่น FB-214 มีข้อมูลน้ำหนักและความสูงขัดกันในต้นทาง จึงแสดงข้อแตกต่างให้ยืนยัน รุ่น ROBUST ไม่ได้ระบุสเปกเพิ่มเติม ส่วนราคาเช่าต่อเนื่องของรถเข็นพับ/ช่วยเดินไม่ได้ระบุรอบเวลา จึงไม่คาดเดา
- การนำเข้ารอบนี้แทนสินค้าตัวอย่างเดิม 8 รายการและ `test_01` ตามคำขอ เก็บคำสั่งซื้อเดิมไว้ พร้อมสำรองสินค้า/หมวดหมู่ก่อนเปลี่ยนใน `data/backups/catalog-before-kin-1789526669232.json`

หากต้องนำเข้าซ้ำ ใช้ `node --env-file-if-exists=.env scripts/import-kin-catalog.mjs` โดยสคริปต์จะตรวจรูปและ active reservations, สำรองข้อมูล, ใช้ transaction และอัปเดต search index หากตั้งค่าไว้ การรันซ้ำจะเขียนทับข้อมูลสินค้า KIN ด้วยชุดนำเข้าที่บันทึกไว้ ไม่ใช่การดึงข้อมูลล่าสุดอัตโนมัติ

## ฟังก์ชัน

- ค้นหาชื่อ รายละเอียด รหัสสินค้า และชื่อหมวดหมู่
- เลือกหมวดหมู่ กรองสินค้าพร้อมจำหน่าย เรียงราคา/ชื่อ/มาใหม่ และแบ่งหน้า
- รายละเอียดสินค้า ราคา คงเหลือ และสินค้าในหมวดหมู่เดียวกัน
- เข้าสู่ระบบหลังบ้านด้วย session cookie แบบ HttpOnly / SameSite
- เพิ่ม แก้ไข ลบสินค้า ตั้งรูปผ่าน HTTPS และป้ายสินค้าคัดสรร
- เพิ่ม แก้ไข ลบหมวดหมู่ ป้องกันลบหมวดหมู่ที่ยังมีสินค้า
- ตรวจข้อมูลฝั่งเซิร์ฟเวอร์ ป้องกัน SKU ซ้ำ ใช้ parameterized SQL และตรวจ Origin สำหรับการเขียนข้อมูล
- หน้าจอรองรับขนาดมือถือ ข้อความโหลด/ข้อผิดพลาด/ไม่พบสินค้า และฟอร์มยืนยันก่อนลบ

- ตะกร้าเก็บบนเบราว์เซอร์ เพิ่ม/ลดจำนวน นำสินค้าออก และแสดงยอดจากเซิร์ฟเวอร์
- Checkout พร้อมข้อมูลผู้รับ ที่อยู่ประเทศไทย และค่าจัดส่งฟรี
- คำสั่งซื้อเก็บ snapshot ชื่อ รหัสสินค้า และราคาเป็นหน่วยสตางค์ ป้องกันการแก้ราคาจากหน้าเว็บ
- จองสต็อกด้วย transaction เมื่อสร้างคำสั่งซื้อ และป้องกันการสร้างซ้ำด้วย idempotency key
- คืนสต็อกครั้งเดียวเมื่อยกเลิก หมดเวลา หรือชำระไม่สำเร็จ
- Payment จำลองสำหรับทดสอบ และ Stripe hosted Checkout สำหรับบัตรเครดิต/เดบิต
- ประวัติคำสั่งซื้อของผู้ซื้อผ่าน guest cookie และรายการคำสั่งซื้อทั้งหมดสำหรับผู้ดูแล

## Cart และ Payment

ค่าเริ่มต้นเป็น **โหมดจำลอง ไม่มีการเรียกเก็บเงินจริง** เลือกสินค้า → ตะกร้า → กรอกที่อยู่ → ยืนยันคำสั่งซื้อ → เลือกจำลองชำระสำเร็จ/ไม่สำเร็จ ระบบไม่มีช่องกรอกเลขบัตรในแอป

การยืนยันคำสั่งซื้อจะนำสินค้าที่สั่งออกจากตะกร้าและจองสต็อก 60 นาที สามารถกลับมาชำระหรือยกเลิกได้ในหน้า “คำสั่งซื้อของฉัน” โดยใช้เบราว์เซอร์เดิม คำสั่งซื้อที่ชำระสำเร็จไม่สามารถยกเลิกจากหน้านี้ได้

### ตั้งค่า Stripe

แก้ `.env` ด้วยคีย์จากบัญชี Stripe ของคุณ เริ่มด้วย test keys:

```dotenv
PAYMENT_PROVIDER=stripe
PUBLIC_URL=http://127.0.0.1:3000
STRIPE_SECRET_KEY=sk_test_replace_with_your_key
STRIPE_WEBHOOK_SECRET=whsec_replace_with_your_secret
```

เมื่อใช้ Stripe ต้องตั้งคีย์ทั้งสองจึงจะเปิดให้สั่งซื้อ ระบบเก็บข้อมูลบัตรที่ Stripe เท่านั้น แอปส่งชื่อสินค้า จำนวน ยอดเงิน อีเมล และรหัสคำสั่งซื้อไปสร้าง Checkout Session

สำหรับทดสอบ webhook ในเครื่อง เมื่อมี Stripe CLI ที่เข้าสู่ระบบแล้ว:

```powershell
stripe listen --forward-to http://127.0.0.1:3000/api/payments/stripe/webhook
```

นำค่า `whsec_...` ที่ CLI แสดงมาใส่ `STRIPE_WEBHOOK_SECRET` แล้วเริ่ม `npm start` ใหม่ จากนั้นทดสอบผ่าน Stripe Checkout ตาม [เอกสารทดสอบของ Stripe](https://docs.stripe.com/testing)

เมื่อใช้โหมดจริง ต้องตั้ง PUBLIC_URL เป็น HTTPS, ใช้ live key, ตั้ง `COOKIE_SECURE=true`, `NODE_ENV=production` และลงทะเบียน webhook ที่โดเมนจริง โดยรับ event:

- `checkout.session.completed`
- `checkout.session.expired`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

ระบบใช้ Stripe SDK ตรวจลายเซ็นจาก request body เดิม และอ่านสถานะจริงจาก Stripe พร้อมตรวจยอดเงิน สกุลเงิน และรหัสคำสั่งซื้อก่อนบันทึกว่าจ่ายแล้ว การกลับมายัง success URL เพียงอย่างเดียวไม่ทำให้คำสั่งซื้อเป็นสถานะชำระสำเร็จ ตาม [แนวทาง fulfillment ของ Stripe](https://docs.stripe.com/checkout/fulfillment)

การยกเลิกจะหมดอายุ Checkout Session ที่ Stripe ก่อนคืนสต็อก หากผู้ให้บริการตอบกลับไม่ได้ ระบบจะคงการจองไว้และลองใหม่ทุกนาทีหลังหมดเวลาคำสั่งซื้อ เพื่อไม่คืนสินค้าขณะที่ยังรับเงินได้ ใช้ idempotency key กับการสร้าง session และค้นหา session เดิมเพื่อกู้คืนกรณีแอปหยุดระหว่างบันทึก

**ขอบเขตที่ทดสอบ:** flow จำลอง, transaction, API, DOM และลายเซ็น webhook ด้วย Stripe SDK ผ่าน mock client ยังไม่ได้ทดลองเชื่อมบัญชี Stripe จริง/Test API ภายนอก หรือ PostgreSQL จริง ไม่มีระบบคืนเงิน อีเมลยืนยัน ติดตามพัสดุ ภาษีแยก หรือคำนวณค่าขนส่งตามพื้นที่ การคืนเงินจริงให้จัดการผ่านผู้ให้บริการและกระทบยอดเอง

โหมดจำลองถูกปิดเมื่อ `NODE_ENV=production` ห้ามใช้ข้อมูลการชำระจำลองเป็นหลักฐานรับเงินจริง ควรใช้งานฐานข้อมูลทดสอบแยกจากฐานข้อมูลขายจริง

## Clean Architecture

### แยกหน้าร้าน / หลังบ้าน / Backend API

- `public/storefront/` คือแอปหน้าร้าน มี HTML, JavaScript และ CSS ของตัวเอง รวมสินค้า ตะกร้า Checkout และประวัติคำสั่งซื้อของลูกค้า
- `public/admin/` คือแอปผู้ดูแลแยกอีกชุด มีหน้า Login, sidebar และหน้าจัดการสินค้า หมวดหมู่ และคำสั่งซื้อ ไม่โหลดโค้ดตะกร้าหรือหน้าร้าน
- `src/` คือ Backend Node.js ที่แยก Domain, Application, Infrastructure และ Presentation ตาม Clean Architecture ทั้งสองแอปเรียกผ่าน `/api/*`
- `/admin` และหน้าจัดการด้านในตรวจ session ที่เซิร์ฟเวอร์ หากยังไม่เข้าสู่ระบบจะ redirect ไป `/admin/login` เมื่อ Login สำเร็จจะกลับหน้าที่ต้องการ
- ใช้รหัสผ่าน `ADMIN_PASSWORD` เดิมใน `.env` มีปุ่มแสดง/ซ่อนรหัสผ่านและออกจากระบบ ไม่ได้เพิ่มบัญชีผู้ใช้ใหม่
- หน้าร้านไม่มีเมนูจัดการร้าน ผู้ดูแลเปิด `/admin/login` โดยตรง การสลับระหว่างหน้าร้านกับหลังบ้านเป็นการเปิด HTML คนละชุด

ทั้งสองแอปยังให้บริการผ่าน Node.js โปรเซสเดียวและ origin เดียว เพื่อใช้ session cookie เดิม จึงไม่ต้องตั้ง CORS หรือเปิดเซิร์ฟเวอร์เพิ่ม

```text
src/
  domain/
    catalog.js                 # กฎข้อมูลสินค้า/หมวดหมู่ และข้อผิดพลาดทางธุรกิจ
    order.js                   # validation ตะกร้า/ผู้รับ และคำนวณเงินเป็นสตางค์
  application/
    ports.js                   # สัญญา Repository และ SearchIndex
    catalog-service.js         # Use cases: ค้นหา, รายละเอียด, CRUD, reindex
    commerce-ports.js          # OrderRepository และ PaymentGateway
    commerce-service.js        # quote, checkout, payment, cancellation, expiry
  infrastructure/
    repository.js              # SQLite / PostgreSQL adapters
    meilisearch.js             # Meilisearch adapter และตรวจสถานะ indexing task
    seed.js                    # ข้อมูลตัวอย่าง
    order-repository.js        # คำสั่งซื้อ, snapshot และการจองสต็อกแบบ atomic
    demo-payment.js            # Payment จำลอง
    stripe-payment.js          # Stripe SDK, session และตรวจ webhook
  presentation/
    http-server.js             # REST API, session, HTTP validation, static files
    commerce-http.js           # guest cookie และ API ตะกร้า/คำสั่งซื้อ
  main.js                      # Composition root: สร้างและฉีด dependencies
public/
  storefront/
    index.html                 # HTML หน้าร้าน
    app.js / styles.css        # หน้าร้านและแค็ตตาล็อก
    shop.js / shop.css         # Cart, Checkout, Payment และคำสั่งซื้อของลูกค้า
  admin/
    index.html                 # HTML หลังบ้าน แยกจากหน้าร้าน
    app.js                     # Login, route guard, CRUD และคำสั่งซื้อทั้งหมด
    styles.css                 # Login และ layout หลังบ้านโดยเฉพาะ
  assets/                      # SVG สินค้าตัวอย่าง
tests/
  catalog.test.js              # use cases และ HTTP integration
  ui.test.js                   # user/admin flow ผ่าน DOM และ API จริง
  commerce.test.js             # pricing, stock race, idempotency, gateway, guest access
  shop-ui.test.js              # ตะกร้าจนถึงชำระสำเร็จและหลังบ้านคำสั่งซื้อ
  admin-routing.test.js        # แยก entry point, redirect, session และ logout
```

Domain ไม่อ้างอิงฐานข้อมูลหรือ HTTP ส่วน Application รับ repository/search/ตัวสร้าง ID ผ่าน constructor จึงสลับ Infrastructure ได้โดยไม่แก้กฎธุรกิจ ส่วน Presentation เรียก use cases ผ่าน service

## ใช้ PostgreSQL + Meilisearch ตาม Flowchart

มี `compose.yaml` สำหรับบริการทั้งสอง ต้องติดตั้ง Docker พร้อม Compose ก่อน เครื่องที่สร้างโปรเจกต์นี้ยังไม่มี Docker จึงยังไม่ได้ทดสอบ integration กับสองบริการนี้จริง

เพิ่มค่าใน `.env` โดยแทนค่ารหัสผ่านและคีย์ด้วยค่าของคุณ:

```dotenv
POSTGRES_PASSWORD=replace-with-your-database-password
DATABASE_URL=postgresql://catalog:replace-with-your-database-password@127.0.0.1:5432/catalog
MEILISEARCH_URL=http://127.0.0.1:7700
MEILISEARCH_KEY=replace-with-your-search-key-at-least-16-characters
```

กรณีรหัสผ่านฐานข้อมูลมีอักขระพิเศษ ให้ URL-encode เฉพาะส่วนรหัสผ่านใน DATABASE_URL

```powershell
docker compose up -d
npm start
```

แอปสร้างตารางและ seed บน PostgreSQL อัตโนมัติเมื่อเริ่มใช้งาน ฐานข้อมูล SQLite และ PostgreSQL แยกกัน ไม่มีการย้ายข้อมูลเดิมอัตโนมัติ

ข้อมูลสินค้าอยู่ในฐานข้อมูลเป็นหลัก Meilisearch เก็บ index สำหรับค้นหา หลังแก้สินค้า/ชื่อหมวดหมู่ ระบบอัปเดต index และรอ task สำเร็จ หากเชื่อมต่อไม่ได้ จะใช้การค้นหาจากฐานข้อมูลแทน และจะลอง reindex ใหม่เมื่อเริ่มเซิร์ฟเวอร์หรือมีการบันทึกสินค้าครั้งถัดไป

## API

| Method              | Path                                                              | การทำงาน                         |
| ------------------- | ----------------------------------------------------------------- | -------------------------------- |
| GET                 | `/api/products?q=&category=&sort=&page=1&limit=12&available=true` | ค้นหาและกรองสินค้า               |
| GET                 | `/api/products/:id`                                               | รายละเอียดสินค้า                 |
| GET                 | `/api/categories`                                                 | หมวดหมู่และจำนวนสินค้า           |
| GET / POST / DELETE | `/api/session`                                                    | สถานะ / เข้าสู่ระบบ / ออกจากระบบ |
| POST                | `/api/products`, `/api/categories`                                | เพิ่มข้อมูล (ผู้ดูแล)            |
| PUT                 | `/api/products/:id`, `/api/categories/:id`                        | แก้ไขข้อมูล (ผู้ดูแล)            |
| DELETE              | `/api/products/:id`, `/api/categories/:id`                        | ลบข้อมูล (ผู้ดูแล)               |

ค่าการเรียง: `newest`, `price-asc`, `price-desc`, `name` ส่วน write API ต้องส่ง `Content-Type: application/json`

### Commerce API

| Method | Path                                | การทำงาน                                                        |
| ------ | ----------------------------------- | --------------------------------------------------------------- |
| GET    | `/api/commerce/config`              | โหมดชำระเงินและสร้าง guest cookie                               |
| POST   | `/api/commerce/quote`               | ตรวจรายการ `{ items: [{ productId, quantity }] }` และราคาจาก DB |
| POST   | `/api/commerce/orders`              | สร้างคำสั่งซื้อด้วย `items`, `customer`, `requestKey`           |
| GET    | `/api/commerce/orders`              | คำสั่งซื้อของ guest สูงสุด 100 รายการล่าสุด                     |
| GET    | `/api/commerce/orders/:id`          | รายละเอียดเฉพาะเจ้าของคำสั่งซื้อ                                |
| POST   | `/api/commerce/orders/:id/pay`      | สร้าง/ใช้ Checkout Session เดิม                                 |
| POST   | `/api/commerce/orders/:id/refresh`  | ตรวจสถานะจาก provider                                           |
| POST   | `/api/commerce/orders/:id/cancel`   | ยกเลิกและคืนสต็อกเมื่อยืนยันได้                                 |
| POST   | `/api/commerce/orders/:id/simulate` | `{ outcome: "paid" หรือ "failed" }` เฉพาะโหมด demo              |
| GET    | `/api/commerce/admin/orders`        | รายการทุกคำสั่งซื้อ ต้องมี admin session                        |
| POST   | `/api/payments/stripe/webhook`      | รับ raw body พร้อม Stripe signature                             |

`customer` ประกอบด้วย `name`, `email`, `phone`, `address`, `postalCode` โดย requestKey ยาว 16–80 ตัวอักษรและใช้ซ้ำเฉพาะคำสั่งซื้อเดิม API เงินทั้งหมดเป็นจำนวนเต็มหน่วยสตางค์ Write endpoint ที่ไม่มีข้อมูลให้ส่ง `{}`

## ตรวจสอบ

```powershell
npm test
npm run format:check
```

ทดสอบการค้นหา ตัวกรอง การแบ่งหน้า validation, CRUD, foreign keys, session, Origin, database fallback และหน้าแรก → ค้นหา → รายละเอียด → เข้าสู่ระบบ → เพิ่ม/แก้ไข/ลบสินค้า → เพิ่มหมวดหมู่ → ออกจากระบบ ด้วย JSDOM และ HTTP server จริงบนฐานข้อมูลชั่วคราว ไม่แก้ฐานข้อมูลใช้งาน

## ข้อจำกัดสำหรับการนำขึ้นระบบจริง

- เริ่มต้น bind เฉพาะ `127.0.0.1` และ session เก็บในหน่วยความจำสำหรับเซิร์ฟเวอร์เดียว เริ่มโปรเซสใหม่ต้องเข้าสู่ระบบใหม่
- เมื่อนำขึ้นเว็บจริง ให้ใช้ HTTPS ตั้ง `COOKIE_SECURE=true` และปรับ `HOST` ตามระบบ reverse proxy ของคุณ
- เป็นผู้ดูแลร่วมหนึ่งรหัสผ่าน หากต้องการหลายบัญชี/บทบาท/ประวัติการแก้ไข ต้องเพิ่มระบบผู้ใช้
- Guest cookie มีอายุ 30 วัน การล้างคุกกี้ทำให้ผู้ซื้อดูประวัติเดิมไม่ได้ แต่ผู้ดูแลยังดูได้ ไม่มีระบบบัญชีลูกค้าหรือกู้คืนคำสั่งซื้อด้วยอีเมล
- SQLite ใช้คิว transaction ร่วมกัน การรอ Stripe อาจหน่วงคำขออื่น สำหรับปริมาณสูงควรใช้ PostgreSQL และงานเบื้องหลังพร้อมระบบป้องกัน abuse/rate limiting สำหรับ guest checkout
- การค้นหาและกรองดึงรายการจากฐานข้อมูลมาประมวลผล เหมาะกับแค็ตตาล็อกขนาดเล็ก ควรย้าย pagination/filter ไป SQL และใช้ outbox/queue สำหรับ search index เมื่อข้อมูลหรือปริมาณการใช้งานเพิ่มขึ้น
- ยังไม่ได้ตรวจภาพหน้าจอในเบราว์เซอร์จริง เนื่องจากไม่มีเบราว์เซอร์เชื่อมต่อในสภาพแวดล้อมนี้ การทดสอบ UI ใช้ JSDOM ซึ่งไม่ตรวจการจัดวางพิกเซล

## เอกสารอ้างอิง

- [Node.js SQLite](https://nodejs.org/api/sqlite.html)
- [node-postgres: Parameterized queries](https://node-postgres.com/features/queries)
- [Meilisearch: Monitoring indexing tasks](https://www.meilisearch.com/docs/capabilities/indexing/tasks_and_batches/monitor_tasks)

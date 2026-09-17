# โครงสร้างฐานข้อมูล PostgreSQL / Neon

ตั้ง `DATABASE_URL` ใน `.env` แล้วรัน:

```powershell
npm run db:init
npm run db:check
```

`db:init` ใช้ `schema.sql` สร้างตารางและดัชนีที่ยังไม่มีใน transaction เดียว รันซ้ำได้ ไม่ลบข้อมูล ไม่ seed และไม่ย้ายข้อมูลจาก SQLite คำสั่งนี้ไม่เปลี่ยนคอลัมน์ของตารางที่มีอยู่แล้ว

| ตาราง              | หน้าที่                                                         |
| ------------------ | --------------------------------------------------------------- |
| categories         | หมวดหมู่สินค้า ชื่อไม่ซ้ำ                                       |
| products           | สินค้า SKU ราคา จำนวนคงเหลือ รูปภาพ และหมวดหมู่                 |
| product_metadata   | รายละเอียดการเช่า อัตราค่าเช่า มัดจำ และแหล่งข้อมูลของสินค้า    |
| orders             | ผู้รับ ที่อยู่ รายการสินค้าขณะสั่งซื้อ ยอดเงิน และสถานะชำระเงิน |
| order_reservations | จำนวนสินค้าที่จองไว้ให้คำสั่งซื้อ                               |

ความสัมพันธ์: categories 1:N products, products 1:0..1 product_metadata และ orders 1:N order_reservations ซึ่งอ้างอิง products

โครงสร้างตรงกับ `src/infrastructure/repository.js` และ `order-repository.js`:

- `products.price` เป็นราคาเงินบาท ส่วนยอดเงินใน orders และราคาสินค้าใน snapshot เป็นจำนวนเต็มหน่วยสตางค์
- `customer`, `items` และ `details` เก็บ JSON ใน TEXT ตามตัวอ่านปัจจุบันของแอป
- วันเวลาเป็น ISO string ใน TEXT
- ตะกร้าเก็บในเบราว์เซอร์ และแอดมินยืนยันรหัสผ่านผ่าน environment configuration จึงยังไม่มีตาราง carts/users แยก
- รายการสินค้าใน orders เป็น snapshot เพื่อรักษาประวัติแม้สินค้าต้นทางถูกแก้ไขหรือลบ

หากปรับโครงสร้างในอนาคต ต้องทำ migration สำหรับตารางเดิมและปรับไฟล์ SQL กับ repository adapters ให้ตรงกัน

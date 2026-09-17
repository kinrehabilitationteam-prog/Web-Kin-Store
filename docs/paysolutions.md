# Pay Solutions / Payso

## ตั้งค่า

โค้ดเชื่อม Secure Link API และ Inquiry API แล้ว ยังต้องทดสอบกับบัญชีร้านก่อนเปิดจริง ใส่ค่าใน `.env` หรือ Environment Variables ของเซิร์ฟเวอร์เท่านั้น:

```dotenv
PAYMENT_PROVIDER=paysolutions
PAYSOLUTIONS_MERCHANT_ID=รหัสร้าน8หลัก
PAYSOLUTIONS_SHOP_NAME=ชื่อร้านส่วนหลังpay.sn/
PAYSOLUTIONS_API_KEY=
PAYSOLUTIONS_SECRET_KEY=
PUBLIC_URL=https://โดเมนร้าน
COOKIE_SECURE=true
```

คง provider เดิมไว้จนกว่าข้อมูลครบ ห้าม commit `.env` ระบบไม่ส่ง API Key/Secret Key ไปที่เบราว์เซอร์ การเลือก paysolutions ยังไม่เปิดรับเงินหากค่าข้างต้นไม่ครบ ระบบนี้ไม่ได้จำลองโหมดทดสอบของ Payso โดยอัตโนมัติ ต้องใช้บัญชีทดสอบที่ผู้ให้บริการยืนยัน

## Flow

1. สร้างคำสั่งซื้อ จองสต็อก และคำนวณยอดจากฐานข้อมูล
2. ใช้เลขอ้างอิงสุ่ม 12 หลักเป็น order ID (ฐานข้อมูลบังคับ unique)
3. บันทึกเครื่องหมายเริ่มชำระก่อนเรียก Secure Link API แล้วส่งลูกค้าไป `https://pay.sn/…`
4. ระบบส่ง return URL และ postback URL พร้อม token เฉพาะคำสั่งซื้อให้ Payso ผ่าน API
5. Postback หรือปุ่มตรวจสอบสถานะเรียก Inquiry API จากเซิร์ฟเวอร์ ตรวจ merchant, reference, product detail, currency `00` (บาท), ยอด และสถานะ `CP` ก่อนยืนยัน paid การกลับมาหน้าร้านอย่างเดียวไม่ถือว่าจ่ายแล้ว

## ข้อจำกัดก่อนเปิดใช้งาน

- สินค้าเช่า KIN เดิมยังไม่เปิด checkout ต้องกำหนดค่าเช่า ระยะเวลา มัดจำ และสต็อกก่อนเปิดรับชำระค่าเช่า
- เอกสาร Inquiry ระบุว่าอาจไม่มี response หากชำระไม่สำเร็จ จึงไม่ตีความ response ว่างเป็น cancelled/failed และไม่คืนสต็อกของรายการที่เริ่มชำระแล้วโดยอัตโนมัติ ต้องให้เจ้าหน้าที่ยืนยัน void/หมดอายุกับ Payso ก่อนแก้ไขกระบวนการนี้
- `expireDate` ส่งตามเวลาไทย และ `oneTime=Y` ต้องยืนยันพฤติกรรมกับบัญชีร้านในการทดสอบจริง เอกสารแสดงพารามิเตอร์แต่ไม่ได้อธิบาย timezone และค่า oneTime ครบถ้วน การคืนสต็อกไม่อาศัยค่าเหล่านี้
- บัญชีร้านต้องตั้งสกุลเงิน THB และเปิดบริการ Secure Link / Inquiry API ระบบปฏิเสธผลที่ไม่ตรงแทนการเดาว่าสำเร็จ
- หากเริ่มสร้างลิงก์แล้วไม่ได้รับคำตอบ ระบบจะไม่สร้างลิงก์ใหม่อัตโนมัติ ต้องให้เจ้าหน้าที่ตรวจสอบรายการกับ Payso ก่อน เพื่อป้องกันลิงก์และการจ่ายซ้ำ
- ยังไม่มีคืนเงินอัตโนมัติ ต้องดำเนินการผ่าน Payso และกระทบยอด

## การทดสอบ

`node --test --test-isolation=none` ทดสอบด้วย API จำลอง: secure link, repeat start, postback ซ้ำ/ปลอม, ยอดไม่ตรง, merchant ไม่ตรง และคงสต็อกเมื่อไม่ทราบผล ยังไม่ได้รับเงินหรือทดสอบบัญชี Payso จริง

เอกสารทางการ:

- https://api-docs.payso.co/docs/api/payment-link/secure-link-api
- https://api-docs.payso.co/docs/api/payment-features/inquiry-api
- https://api-docs.payso.co/docs/api/redirect/simple-payment

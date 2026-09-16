import { CatalogError } from "./catalog.js";

export function cartInput(items) {
  if (!Array.isArray(items) || !items.length || items.length > 50)
    throw new CatalogError("ตะกร้าต้องมีสินค้า 1–50 รายการ");
  const unique = new Map();
  for (const item of items) {
    if (
      !item ||
      typeof item.productId !== "string" ||
      !item.productId ||
      item.productId.length > 80 ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 99
    )
      throw new CatalogError("จำนวนสินค้าต้องเป็นจำนวนเต็ม 1–99 ชิ้น");
    const quantity = (unique.get(item.productId) || 0) + item.quantity;
    if (quantity > 99)
      throw new CatalogError("สินค้าแต่ละรายการสั่งได้ไม่เกิน 99 ชิ้น");
    unique.set(item.productId, quantity);
  }
  return [...unique]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

export function customerInput(input) {
  if (!input || typeof input !== "object")
    throw new CatalogError("กรุณากรอกข้อมูลผู้รับ");
  const fields = {
    name: 120,
    email: 254,
    phone: 30,
    address: 1000,
    postalCode: 5,
  };
  const customer = {};
  for (const [key, max] of Object.entries(fields)) {
    if (
      typeof input[key] !== "string" ||
      !input[key].trim() ||
      input[key].trim().length > max
    )
      throw new CatalogError(
        "กรุณากรอกข้อมูลผู้รับให้ครบถ้วนและไม่เกินความยาวที่กำหนด",
      );
    customer[key] = input[key].trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))
    throw new CatalogError("อีเมลไม่ถูกต้อง");
  if (!/^[+\d ()-]{8,30}$/.test(customer.phone))
    throw new CatalogError("เบอร์โทรศัพท์ไม่ถูกต้อง");
  if (!/^\d{5}$/.test(customer.postalCode))
    throw new CatalogError("รหัสไปรษณีย์ต้องมี 5 หลัก");
  return customer;
}

export function quoteProducts(items, products) {
  const lines = items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product)
      throw new CatalogError(
        "มีสินค้าที่ถูกนำออกจากแค็ตตาล็อก กรุณานำออกจากตะกร้า",
        409,
      );
    if (product.catalog?.purchaseMode === "inquiry")
      throw new CatalogError(
        "สินค้านี้เป็นรายการเช่า กรุณาสอบถามราคาและความพร้อมกับเจ้าหน้าที่ก่อน",
        409,
      );
    if (product.stock < item.quantity)
      throw new CatalogError(
        `${product.name} มีสินค้าเหลือ ${product.stock} ชิ้น`,
        409,
      );
    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      image: product.image,
      quantity: item.quantity,
      unitAmount: Math.round(Number(product.price) * 100),
    };
  });
  const subtotal = lines.reduce(
    (sum, item) => sum + item.unitAmount * item.quantity,
    0,
  );
  // Money is represented as integer satang throughout checkout and payment.
  if (!Number.isSafeInteger(subtotal) || subtotal < 0 || subtotal > 99999999)
    throw new CatalogError(
      "ยอดสั่งซื้อสูงเกินขอบเขตที่รองรับ (999,999.99 บาท)",
    );
  return {
    items: lines,
    subtotal,
    shipping: 0,
    total: subtotal,
    currency: "thb",
  };
}

export function checkoutInput(input) {
  if (
    typeof input.requestKey !== "string" ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestKey)
  )
    throw new CatalogError("รหัสคำขอสั่งซื้อไม่ถูกต้อง");
  return {
    items: cartInput(input.items),
    customer: customerInput(input.customer),
    requestKey: input.requestKey,
  };
}

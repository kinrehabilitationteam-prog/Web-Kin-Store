export class CatalogError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
function required(value, label, max) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new CatalogError(`${label}ต้องมีความยาว 1–${max} ตัวอักษร`);
  return value.trim();
}
export function categoryInput(input) {
  return { name: required(input.name, "ชื่อหมวดหมู่", 80) };
}
export function productInput(input) {
  const name = required(input.name, "ชื่อสินค้า", 160);
  const sku = required(input.sku, "รหัสสินค้า", 40).toUpperCase();
  const description = required(input.description, "รายละเอียด", 4000);
  const categoryId = required(input.categoryId, "หมวดหมู่", 80);
  const price = Number(input.price),
    stock = Number(input.stock);
  if (
    input.price === "" ||
    !Number.isFinite(price) ||
    price < 0 ||
    price > 100000000
  )
    throw new CatalogError("ราคาสินค้าไม่ถูกต้อง");
  if (
    input.stock === "" ||
    !Number.isSafeInteger(stock) ||
    stock < 0 ||
    stock > 10000000
  )
    throw new CatalogError("จำนวนสินค้าต้องเป็นจำนวนเต็มตั้งแต่ 0");
  const image = typeof input.image === "string" ? input.image.trim() : "";
  if (
    image &&
    !/^https:\/\/[^\s]+$/.test(image) &&
    !/^\/assets\/(?:[a-z-]+\.svg|kin\/product-\d+\.(?:jpg|webp))$/.test(image)
  )
    throw new CatalogError("รูปภาพต้องเป็นลิงก์ HTTPS");
  return {
    name,
    sku,
    description,
    categoryId,
    price: Math.round(price * 100) / 100,
    stock,
    image: image || "/assets/vase.svg",
    featured: input.featured === true,
  };
}

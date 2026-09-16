import { OrderRepository } from "../application/commerce-ports.js";
import { CatalogError } from "../domain/catalog.js";
import { quoteProducts } from "../domain/order.js";

const schema = [
  `CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, owner TEXT NOT NULL, "requestKey" TEXT NOT NULL, fingerprint TEXT NOT NULL, customer TEXT NOT NULL, items TEXT NOT NULL, subtotal INTEGER NOT NULL, shipping INTEGER NOT NULL, total INTEGER NOT NULL, currency TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, "paymentId" TEXT, "checkoutUrl" TEXT, "createdAt" TEXT NOT NULL, "expiresAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL, UNIQUE(owner, "requestKey"))`,
  `CREATE TABLE IF NOT EXISTS order_reservations ("orderId" TEXT NOT NULL REFERENCES orders(id), "productId" TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity > 0), PRIMARY KEY("orderId", "productId"))`,
  `CREATE INDEX IF NOT EXISTS orders_owner_created ON orders(owner, "createdAt")`,
];
const decode = (row) =>
  row
    ? {
        ...row,
        items: JSON.parse(row.items),
        customer: JSON.parse(row.customer),
      }
    : null;

export class SqlOrderRepository extends OrderRepository {
  constructor(database) {
    super();
    this.database = database;
  }
  async initialize() {
    for (const sql of schema) await this.database.query(sql);
  }
  async get(id, owner) {
    const rows = await this.database.query(
      "SELECT * FROM orders WHERE id=$1" + (owner ? " AND owner=$2" : ""),
      owner ? [id, owner] : [id],
    );
    if (!rows.length) throw new CatalogError("ไม่พบคำสั่งซื้อ", 404);
    return decode(rows[0]);
  }
  async list(owner) {
    return (
      await this.database.query(
        "SELECT * FROM orders" +
          (owner ? " WHERE owner=$1" : "") +
          ' ORDER BY "createdAt" DESC LIMIT 100',
        owner ? [owner] : [],
      )
    ).map(decode);
  }
  async create({
    id,
    owner,
    requestKey,
    fingerprint,
    customer,
    items,
    provider,
  }) {
    return this.database.transaction(async (query) => {
      const now = new Date().toISOString(),
        expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      // Unique insertion also serializes requests with the same idempotency key in PostgreSQL.
      const inserted = await query(
        'INSERT INTO orders (id,owner,"requestKey",fingerprint,customer,items,subtotal,shipping,total,currency,provider,status,"createdAt","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,0,0,0,$7,$8,$9,$10,$11,$12) ON CONFLICT(owner,"requestKey") DO NOTHING RETURNING id',
        [
          id,
          owner,
          requestKey,
          fingerprint,
          JSON.stringify(customer),
          "[]",
          "thb",
          provider,
          "pending",
          now,
          expiresAt,
          now,
        ],
      );
      if (!inserted.length) {
        const existing = decode(
          (
            await query(
              'SELECT * FROM orders WHERE owner=$1 AND "requestKey"=$2',
              [owner, requestKey],
            )
          )[0],
        );
        if (existing.fingerprint !== fingerprint)
          throw new CatalogError(
            "คำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว กรุณาเริ่มคำสั่งซื้อใหม่",
            409,
          );
        return existing;
      }
      const products = [];
      // Conditional updates reserve stock atomically; sorted IDs avoid lock-order deadlocks.
      for (const item of items) {
        const metadata = await query(
          'SELECT details FROM product_metadata WHERE "productId"=$1',
          [item.productId],
        );
        if (
          metadata[0] &&
          JSON.parse(metadata[0].details).purchaseMode === "inquiry"
        )
          throw new CatalogError(
            "สินค้านี้ต้องติดต่อเจ้าหน้าที่เพื่อยืนยันเงื่อนไขการเช่า",
            409,
          );
        const rows = await query(
          "UPDATE products SET stock=stock-$1 WHERE id=$2 AND stock >= $3 RETURNING *",
          [item.quantity, item.productId, item.quantity],
        );
        if (!rows.length)
          throw new CatalogError(
            "สินค้าหมดหรือมีจำนวนไม่เพียงพอ กรุณาตรวจตะกร้าอีกครั้ง",
            409,
          );
        products.push({ ...rows[0], stock: rows[0].stock + item.quantity });
        await query(
          'INSERT INTO order_reservations ("orderId","productId",quantity) VALUES ($1,$2,$3)',
          [id, item.productId, item.quantity],
        );
      }
      const quote = quoteProducts(items, products);
      await query(
        "UPDATE orders SET items=$1,subtotal=$2,shipping=$3,total=$4 WHERE id=$5",
        [
          JSON.stringify(quote.items),
          quote.subtotal,
          quote.shipping,
          quote.total,
          id,
        ],
      );
      return decode((await query("SELECT * FROM orders WHERE id=$1", [id]))[0]);
    });
  }
  async mutate(id, owner, work) {
    return this.database.transaction(async (query, dialect) => {
      const rows = await query(
        "SELECT * FROM orders WHERE id=$1" +
          (owner ? " AND owner=$2" : "") +
          (dialect === "postgres" ? " FOR UPDATE" : ""),
        owner ? [id, owner] : [id],
      );
      if (!rows.length) throw new CatalogError("ไม่พบคำสั่งซื้อ", 404);
      const previous = decode(rows[0]),
        next = await work({ ...previous });
      if (previous.status === "pending" && next.status !== "pending") {
        if (next.status !== "paid") {
          const reservations = await query(
            'SELECT * FROM order_reservations WHERE "orderId"=$1',
            [id],
          );
          for (const item of reservations)
            await query("UPDATE products SET stock=stock+$1 WHERE id=$2", [
              item.quantity,
              item.productId,
            ]);
        }
        // Order items are immutable snapshots; only active reservations reference products.
        await query('DELETE FROM order_reservations WHERE "orderId"=$1', [id]);
      }
      await query(
        'UPDATE orders SET status=$1,"paymentId"=$2,"checkoutUrl"=$3,"updatedAt"=$4 WHERE id=$5',
        [
          next.status,
          next.paymentId || null,
          next.checkoutUrl || null,
          new Date().toISOString(),
          id,
        ],
      );
      return decode((await query("SELECT * FROM orders WHERE id=$1", [id]))[0]);
    });
  }
  async pending(provider) {
    return (
      await this.database.query(
        'SELECT * FROM orders WHERE status=\'pending\' AND provider=$1 AND "expiresAt" <= $2 ORDER BY "createdAt" LIMIT 100',
        [provider, new Date().toISOString()],
      )
    ).map(decode);
  }
}

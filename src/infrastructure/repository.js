import { CatalogRepository } from "../application/ports.js";
import { CatalogError } from "../domain/catalog.js";
const schema = `CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL, "categoryId" TEXT NOT NULL REFERENCES categories(id), price REAL NOT NULL CHECK(price >= 0), stock INTEGER NOT NULL CHECK(stock >= 0), image TEXT NOT NULL, featured INTEGER NOT NULL, "createdAt" TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS product_metadata ("productId" TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE, details TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS product_images (id TEXT PRIMARY KEY, type TEXT NOT NULL, data TEXT NOT NULL);`;
export class SqlCatalogRepository extends CatalogRepository {
  constructor(query, close, transaction) {
    super();
    this.query = query;
    this.close = close;
    this.transaction = transaction;
  }
  async initialize() {
    for (const statement of schema.split(";").filter((s) => s.trim()))
      await this.query(statement);
  }
  async listProducts() {
    return (
      await this.query(
        'SELECT p.*, c.name AS "categoryName", m.details AS "catalogJson" FROM products p JOIN categories c ON c.id=p."categoryId" LEFT JOIN product_metadata m ON m."productId"=p.id',
      )
    ).map(({ catalogJson, ...p }) => ({
      ...p,
      price: Number(p.price),
      featured: !!p.featured,
      ...(catalogJson ? { catalog: JSON.parse(catalogJson) } : {}),
    }));
  }
  saveImage(image) {
    return this.query(
      "INSERT INTO product_images (id,type,data) VALUES ($1,$2,$3) ON CONFLICT(id) DO NOTHING",
      [image.id, image.type, image.data],
    );
  }
  async getImage(id) {
    return (
      await this.query("SELECT type,data FROM product_images WHERE id=$1", [id])
    )[0];
  }
  listCategories() {
    return this.query(
      'SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p."categoryId"=c.id) AS count FROM categories c ORDER BY c.name',
    );
  }
  async safeQuery(sql, values) {
    try {
      return await this.query(sql, values);
    } catch (error) {
      if (/unique|duplicate/i.test(error.message))
        throw new CatalogError("รหัสสินค้าหรือชื่อหมวดหมู่ซ้ำ", 409);
      if (/foreign key/i.test(error.message))
        throw new CatalogError("หมวดหมู่ไม่ถูกต้องหรือยังมีสินค้าอยู่", 409);
      throw error;
    }
  }
  saveProduct(p) {
    return this.safeQuery(
      'INSERT INTO products (id,sku,name,description,"categoryId",price,stock,image,featured,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET sku=excluded.sku,name=excluded.name,description=excluded.description,"categoryId"=excluded."categoryId",price=excluded.price,stock=excluded.stock,image=excluded.image,featured=excluded.featured',
      [
        p.id,
        p.sku,
        p.name,
        p.description,
        p.categoryId,
        p.price,
        p.stock,
        p.image,
        p.featured ? 1 : 0,
        p.createdAt,
      ],
    );
  }
  deleteProduct(id) {
    return this.safeQuery("DELETE FROM products WHERE id=$1", [id]);
  }
  saveCategory(c) {
    return this.safeQuery(
      "INSERT INTO categories (id,name) VALUES ($1,$2) ON CONFLICT(id) DO UPDATE SET name=excluded.name",
      [c.id, c.name],
    );
  }
  deleteCategory(id) {
    return this.safeQuery("DELETE FROM categories WHERE id=$1", [id]);
  }
}
export async function createRepository({
  databaseUrl,
  sqlitePath = "data/catalog.sqlite",
} = {}) {
  let repository;
  if (databaseUrl) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: databaseUrl });
    repository = new SqlCatalogRepository(
      async (sql, values = []) => (await pool.query(sql, values)).rows,
      () => pool.end(),
      async (work) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await work(
            async (sql, values = []) => (await client.query(sql, values)).rows,
            "postgres",
          );
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
    );
  } else {
    const { DatabaseSync } = await import("node:sqlite");
    const { mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    if (sqlitePath !== ":memory:")
      await mkdir(dirname(sqlitePath), { recursive: true });
    const db = new DatabaseSync(sqlitePath);
    db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
    // Serialize all access to the shared SQLite connection, including async transactions.
    let queue = Promise.resolve();
    const exclusive = (work) => {
      const result = queue.then(work);
      queue = result.catch(() => {});
      return result;
    };
    const query = async (sql, values = []) => {
      const statement = db.prepare(sql.replace(/\$\d+/g, "?"));
      if (statement.columns().length) return statement.all(...values);
      statement.run(...values);
      return [];
    };
    repository = new SqlCatalogRepository(
      (sql, values) => exclusive(() => query(sql, values)),
      () => db.close(),
      (work) =>
        exclusive(async () => {
          db.exec("BEGIN IMMEDIATE");
          try {
            const result = await work(query, "sqlite");
            db.exec("COMMIT");
            return result;
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
        }),
    );
  }
  await repository.initialize();
  return repository;
}

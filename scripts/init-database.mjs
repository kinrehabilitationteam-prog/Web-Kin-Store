import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL in .env before initializing PostgreSQL.");
  process.exitCode = 1;
} else {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
    query_timeout: 30000,
  });
  let transaction = false;
  try {
    const sql = await readFile(
      new URL("../database/schema.sql", import.meta.url),
      "utf8",
    );
    await client.connect();
    await client.query("BEGIN");
    transaction = true;
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query(sql);
    const tables = [
      "categories",
      "products",
      "product_metadata",
      "product_images",
      "orders",
      "order_reservations",
    ];
    const counts = {};
    for (const table of tables) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::integer AS count FROM ${table}`,
      );
      counts[table] = rows[0].count;
    }
    await client.query("COMMIT");
    transaction = false;
    console.log(JSON.stringify({ initialized: true, rows: counts }, null, 2));
  } catch (error) {
    if (transaction) await client.query("ROLLBACK").catch(() => {});
    const code = /^[A-Z0-9_]+$/.test(error.code || "")
      ? error.code
      : "INITIALIZATION_FAILED";
    console.error(
      `Database initialization failed (${code}). No credentials are logged.`,
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

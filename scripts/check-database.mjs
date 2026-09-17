import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "DATABASE_URL is missing. Set it in .env before connecting to Neon.",
  );
  process.exitCode = 1;
} else {
  let client;
  try {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol))
      throw Object.assign(new Error(), { code: "INVALID_DATABASE_URL" });
    client = new pg.Client({
      connectionString,
      connectionTimeoutMillis: 15000,
      query_timeout: 15000,
    });
    await client.connect();
    await client.query("SELECT 1");
    const { rows } = await client.query(
      "SELECT to_regclass('public.categories') IS NOT NULL AS categories, to_regclass('public.products') IS NOT NULL AS products, to_regclass('public.product_metadata') IS NOT NULL AS product_metadata, to_regclass('public.orders') IS NOT NULL AS orders, to_regclass('public.order_reservations') IS NOT NULL AS order_reservations",
    );
    console.log(
      JSON.stringify(
        {
          connected: true,
          provider: url.hostname.endsWith(".neon.tech")
            ? "Neon PostgreSQL"
            : "PostgreSQL",
          tables: rows[0],
        },
        null,
        2,
      ),
    );
  } catch (error) {
    // Never print connection strings, credentials, or raw server error messages.
    const code = /^[A-Z0-9_]+$/.test(error.code || "")
      ? error.code
      : "CONNECTION_FAILED";
    console.error(
      `Database check failed (${code}). Check DATABASE_URL, SSL settings and network access.`,
    );
    process.exitCode = 1;
  } finally {
    if (client) await client.end();
  }
}

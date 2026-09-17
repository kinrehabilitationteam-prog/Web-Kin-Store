import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";

// Explicit PostgreSQL + running local API integration check. Only disposable rows
// created for this run are removed; no existing stock or orders are modified.
const run = randomUUID();
const productId = `stock-test-${run}`;
const categoryId = `stock-test-${run}`;
const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
  query_timeout: 15000,
});
let owner,
  cookie,
  connected = false,
  fixtures = false;
const results = [];
async function api(path, data) {
  const response = await fetch(base + "/api/commerce" + path, {
    method: data ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const value = await response.json();
  return { response, value };
}
async function stock(expected, step) {
  const { rows } = await client.query(
    "SELECT stock FROM products WHERE id=$1",
    [productId],
  );
  assert.equal(rows[0].stock, expected, step);
  results.push({ step, stock: rows[0].stock });
}
async function checkout(quantity, requestKey = randomUUID()) {
  return api("/orders", {
    items: [{ productId, quantity }],
    requestKey,
    customer: {
      name: "STOCK TEST ONLY",
      email: "stock-test@example.com",
      phone: "0000000000",
      address: "TEST ADDRESS - DO NOT SHIP",
      postalCode: "00000",
    },
  });
}
async function action(id, action, body = {}) {
  const result = await api(`/orders/${id}/${action}`, body);
  assert.equal(result.response.status, 200);
  return result.value;
}
try {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL required");
  assert.ok(
    new URL(process.env.DATABASE_URL).hostname.endsWith(".neon.tech"),
    "Neon required",
  );
  const config = await api("/config");
  assert.equal(config.response.status, 200);
  assert.equal(
    config.value.provider,
    "demo",
    "Only demo payments may be tested",
  );
  assert.equal(config.value.enabled, true);
  cookie = config.response.headers.get("set-cookie").split(";")[0];
  owner = createHash("sha256")
    .update(cookie.slice("catalog_guest=".length))
    .digest("hex");
  await client.connect();
  connected = true;
  await client.query("BEGIN");
  try {
    await client.query("INSERT INTO categories(id,name) VALUES ($1,$2)", [
      categoryId,
      `STOCK TEST ${run}`,
    ]);
    await client.query(
      'INSERT INTO products(id,sku,name,description,"categoryId",price,stock,image,featured,"createdAt") VALUES ($1,$2,$3,$4,$5,100,10,$6,0,$7)',
      [
        productId,
        `TEST-${run}`,
        "STOCK TEST - NOT FOR SALE",
        "Temporary stock verification fixture",
        categoryId,
        "/assets/vase.svg",
        new Date().toISOString(),
      ],
    );
    await client.query("COMMIT");
    fixtures = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  // Confirms the running app actually reads the same Neon database.
  const response = await fetch(`${base}/api/products/${productId}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).stock, 10);
  await stock(10, "initial");
  const key = randomUUID();
  const first = await checkout(3, key);
  assert.equal(first.response.status, 201);
  assert.equal(first.value.total, 30000);
  await stock(7, "checkout 3 reserves stock");
  const repeat = await checkout(3, key);
  assert.equal(repeat.response.status, 201);
  assert.equal(repeat.value.id, first.value.id);
  await stock(7, "duplicate checkout does not reserve again");
  await action(first.value.id, "pay");
  const paid = await action(first.value.id, "simulate", { outcome: "paid" });
  assert.equal(paid.status, "paid");
  await stock(7, "paid 3 items");
  await action(first.value.id, "simulate", { outcome: "paid" });
  await stock(7, "duplicate paid confirmation");
  const paidRow = (
    await client.query("SELECT status,total,items FROM orders WHERE id=$1", [
      paid.id,
    ])
  ).rows[0];
  assert.equal(paidRow.status, "paid");
  assert.equal(paidRow.total, 30000);
  assert.equal(JSON.parse(paidRow.items)[0].quantity, 3);
  const cancelOrder = await checkout(2);
  assert.equal(cancelOrder.response.status, 201);
  await stock(5, "checkout 2 for cancellation");
  await action(cancelOrder.value.id, "cancel");
  await stock(7, "cancellation restores 2");
  await action(cancelOrder.value.id, "cancel");
  await stock(7, "duplicate cancellation");
  const failedOrder = await checkout(2);
  assert.equal(failedOrder.response.status, 201);
  await stock(5, "checkout 2 for payment failure");
  await action(failedOrder.value.id, "simulate", { outcome: "failed" });
  await stock(7, "failed payment restores 2");
  const excess = await checkout(8);
  assert.equal(excess.response.status, 409);
  await stock(7, "reject order exceeding stock");
  const concurrent = await Promise.all([checkout(5), checkout(5)]);
  assert.deepEqual(concurrent.map((r) => r.response.status).sort(), [201, 409]);
  await stock(2, "concurrent orders cannot oversell");
  await action(
    concurrent.find((r) => r.response.status === 201).value.id,
    "cancel",
  );
  await stock(7, "restore concurrent test reservation");
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      { passed: false, code: error.code || "TEST_FAILED", completed: results },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  if (connected && fixtures) {
    try {
      await client.query("BEGIN");
      await client.query(
        'DELETE FROM order_reservations WHERE "orderId" IN (SELECT id FROM orders WHERE owner=$1)',
        [owner],
      );
      await client.query(
        "DELETE FROM orders WHERE owner=$1 AND provider='demo'",
        [owner],
      );
      await client.query("DELETE FROM products WHERE id=$1", [productId]);
      await client.query("DELETE FROM categories WHERE id=$1", [categoryId]);
      await client.query("COMMIT");
      console.log(
        "Temporary stock test product, category and demo orders removed.",
      );
    } catch {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`Test cleanup failed. Fixture ID: ${productId}`);
      process.exitCode = 1;
    }
  }
  await client.end();
}

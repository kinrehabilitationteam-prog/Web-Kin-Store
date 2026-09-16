import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import Stripe from "stripe";
import { createRepository } from "../src/infrastructure/repository.js";
import { SqlOrderRepository } from "../src/infrastructure/order-repository.js";
import { seed } from "./fixtures/demo-seed.js";
import { CommerceService } from "../src/application/commerce-service.js";
import { CatalogService } from "../src/application/catalog-service.js";
import { DemoPaymentGateway } from "../src/infrastructure/demo-payment.js";
import { StripePaymentGateway } from "../src/infrastructure/stripe-payment.js";
import { createHttpServer } from "../src/presentation/http-server.js";

const customer = {
  name: "ลูกค้าทดสอบ",
  email: "customer@example.com",
  phone: "0812345678",
  address: "123 ถนนสุขุมวิท กรุงเทพฯ",
  postalCode: "10110",
};
const input = (items = [{ productId: "vase", quantity: 2 }]) => ({
  items,
  customer,
  requestKey: randomUUID(),
});
async function setup(t, gateway = new DemoPaymentGateway()) {
  const db = await createRepository({ sqlitePath: ":memory:" });
  await seed(db);
  const orders = new SqlOrderRepository(db);
  await orders.initialize();
  const service = new CommerceService({
    catalog: db,
    orders,
    gateway,
    newId: randomUUID,
    fingerprint: (v) => createHash("sha256").update(v).digest("hex"),
  });
  t.after(() => db.close());
  return { db, orders, service };
}
test("server prices, integer money, validation, ownership and immutable snapshots", async (t) => {
  const { service, db } = await setup(t);
  const order = await service.checkout("owner", {
    ...input(),
    total: 1,
    items: [{ productId: "vase", quantity: 2, price: 1 }],
  });
  assert.equal(order.total, 178000);
  assert.equal(order.items[0].unitAmount, 89000);
  assert.equal(order.owner, undefined);
  assert.equal(
    (await db.listProducts()).find((p) => p.id === "vase").stock,
    22,
  );
  await assert.rejects(() => service.get("other", order.id), { status: 404 });
  await assert.rejects(() => service.cancel("other", order.id), {
    status: 404,
  });
  await assert.rejects(
    () =>
      service.checkout("owner", input([{ productId: "vase", quantity: -1 }])),
    { status: 400 },
  );
  await assert.rejects(
    () =>
      service.checkout("owner", {
        ...input(),
        customer: { ...customer, email: "invalid" },
      }),
    { status: 400 },
  );
  await db.query("UPDATE products SET price=1 WHERE id=$1", ["vase"]);
  assert.equal((await service.get("owner", order.id)).total, 178000);
});
test("duplicate requests reserve once; concurrent buyers cannot oversell; failed reservation rolls back", async (t) => {
  const { service, db } = await setup(t),
    data = input([{ productId: "chair", quantity: 8 }]);
  const results = await Promise.all([
    service.checkout("owner", data),
    service.checkout("owner", data),
  ]);
  assert.equal(results[0].id, results[1].id);
  await assert.rejects(
    () =>
      service.checkout("owner", {
        ...data,
        customer: { ...customer, name: "Different" },
      }),
    { status: 409 },
  );
  await assert.rejects(
    () =>
      service.checkout("other", input([{ productId: "chair", quantity: 1 }])),
    { status: 409 },
  );
  const concurrent = await Promise.allSettled([
    service.checkout("one", input([{ productId: "stool", quantity: 4 }])),
    service.checkout("two", input([{ productId: "stool", quantity: 4 }])),
  ]);
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
  await assert.rejects(
    () =>
      service.checkout(
        "third",
        input([
          { productId: "bowl", quantity: 1 },
          { productId: "pendant", quantity: 1 },
        ]),
      ),
    { status: 409 },
  );
  assert.equal(
    (await db.listProducts()).find((p) => p.id === "bowl").stock,
    36,
  );
});
test("payment is idempotent; failures/cancellation/expiry restore stock exactly once", async (t) => {
  const { service, db } = await setup(t);
  const paid = await service.checkout("owner", input());
  await Promise.all([
    service.simulate("owner", paid.id, "paid"),
    service.simulate("owner", paid.id, "paid"),
  ]);
  await service.cancel("owner", paid.id);
  assert.equal((await service.get("owner", paid.id)).status, "paid");
  assert.equal(
    (await db.listProducts()).find((p) => p.id === "vase").stock,
    22,
  );
  for (const action of ["cancel", "failed", "expired"]) {
    const order = await service.checkout("owner", input());
    if (action === "cancel")
      await Promise.all([
        service.cancel("owner", order.id),
        service.cancel("owner", order.id),
      ]);
    if (action === "failed")
      await service.simulate("owner", order.id, "failed");
    if (action === "expired") {
      await db.query('UPDATE orders SET "expiresAt"=$1 WHERE id=$2', [
        new Date(0).toISOString(),
        order.id,
      ]);
      await service.expirePending();
    }
    assert.equal(
      (await db.listProducts()).find((p) => p.id === "vase").stock,
      22,
    );
  }
});
test("active reservations prevent deletion; completed snapshots survive product deletion", async (t) => {
  const { service, db } = await setup(t);
  const order = await service.checkout("owner", input());
  await assert.rejects(() => db.deleteProduct("vase"));
  await service.simulate("owner", order.id, "paid");
  await db.deleteProduct("vase");
  assert.equal(
    (await service.get("owner", order.id)).items[0].name,
    "แจกันเซรามิก ทรงออร์แกนิก",
  );
});
test("Stripe verified amount, duplicate webhooks, signature rejection and remote cancellation", async (t) => {
  const stripe = new Stripe("sk_test_local_fake"),
    secret = "whsec_local_test";
  let session;
  const sessions = {
    list: () => ({
      async *[Symbol.asyncIterator]() {
        if (session) yield session;
      },
    }),
    create: async (params) =>
      (session = {
        ...params,
        id: "cs_test_local",
        url: "https://checkout.stripe.com/c/test",
        status: "open",
        payment_status: "unpaid",
        amount_total: params.line_items.reduce(
          (n, i) => n + i.quantity * i.price_data.unit_amount,
          0,
        ),
        currency: "thb",
      }),
    retrieve: async () => session,
    expire: async () => {
      session = { ...session, status: "expired" };
      return session;
    },
  };
  const gateway = new StripePaymentGateway({
    secretKey: "sk_test_local_fake",
    webhookSecret: secret,
    client: { checkout: { sessions }, webhooks: stripe.webhooks },
  });
  const { service, db } = await setup(t, gateway);
  const order = await service.checkout("owner", input());
  await service.start("owner", order.id);
  await service.start("owner", order.id);
  await assert.rejects(() => service.simulate("owner", order.id, "paid"), {
    status: 404,
  });
  session = {
    ...session,
    status: "complete",
    payment_status: "paid",
    amount_total: 1,
  };
  await assert.rejects(() => service.refresh("owner", order.id), {
    status: 409,
  });
  session.amount_total = order.total;
  const raw = JSON.stringify({
    id: "evt_test",
    type: "checkout.session.completed",
    data: { object: session },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: raw,
    secret,
  });
  await assert.rejects(() => service.webhook(Buffer.from(raw), "invalid"), {
    status: 400,
  });
  await service.webhook(Buffer.from(raw), signature);
  await service.webhook(Buffer.from(raw), signature);
  assert.equal((await service.get("owner", order.id)).status, "paid");
  assert.equal(
    (await db.listProducts()).find((p) => p.id === "vase").stock,
    22,
  );
  session = null;
  const cancelled = await service.checkout("owner", input());
  await service.start("owner", cancelled.id);
  await service.cancel("owner", cancelled.id);
  assert.equal(session.status, "expired");
  assert.equal(
    (await db.listProducts()).find((p) => p.id === "vase").stock,
    22,
  );
});
test("HTTP guest cookies and protected order/admin APIs", async (t) => {
  const { service, db } = await setup(t);
  const server = createHttpServer(new CatalogService(db, null, randomUUID), {
    commerce: service,
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(
    () =>
      new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (path, method = "GET", data, cookie = "") =>
    fetch(base + "/api/commerce" + path, {
      method,
      headers: { "Content-Type": "application/json", cookie },
      body: data ? JSON.stringify(data) : undefined,
    });
  const config = await req("/config");
  const cookie = config.headers.get("set-cookie").split(";")[0];
  assert.match(config.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  const created = await req("/orders", "POST", input(), cookie);
  assert.equal(created.status, 201);
  const order = await created.json();
  assert.equal((await req("/orders/" + order.id)).status, 404);
  assert.equal(
    (
      await req("/orders/" + order.id + "/simulate", "POST", {
        outcome: "paid",
      })
    ).status,
    404,
  );
  assert.equal(
    (await req("/admin/orders", "GET", undefined, cookie)).status,
    401,
  );
  const result = await req(
    "/orders/" + order.id + "/simulate",
    "POST",
    { outcome: "paid" },
    cookie,
  );
  assert.equal(result.status, 200);
  assert.equal((await result.json()).status, "paid");
});

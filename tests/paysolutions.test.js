import test from "node:test";
import assert from "node:assert/strict";
import { PaySolutionsPaymentGateway } from "../src/infrastructure/paysolutions-payment.js";
import { createRepository } from "../src/infrastructure/repository.js";
import { SqlOrderRepository } from "../src/infrastructure/order-repository.js";
import { CommerceService } from "../src/application/commerce-service.js";
import { seed } from "./fixtures/demo-seed.js";
import { randomUUID } from "node:crypto";

test("Pay Solutions secure link, verified postback, duplicate events and uncertain payment stock", async (t) => {
  let result = null,
    created = 0,
    sent;
  const gateway = new PaySolutionsPaymentGateway({
    merchantId: "12345678",
    shopName: "test-shop",
    apiKey: "api-test",
    secretKey: "secret-test",
    publicUrl: "https://store.example",
    fetcher: async (url, options) => {
      assert.equal(options.redirect, "error");
      if (url.includes("encryptz")) {
        created++;
        sent = JSON.parse(options.body);
        return new Response(
          JSON.stringify({
            merchant: "test-shop",
            payValue: "encrypted",
            orderDetail: "ciphertext",
          }),
        );
      }
      assert.equal(options.headers.merchantID, "45678");
      assert.equal(options.headers.merchantSecretKey, "secret-test");
      return new Response(result ? JSON.stringify(result) : "");
    },
  });
  const db = await createRepository({ sqlitePath: ":memory:" });
  t.after(() => db.close());
  await seed(db);
  const orders = new SqlOrderRepository(db);
  await orders.initialize();
  const service = new CommerceService({
    catalog: db,
    orders,
    gateway,
    newId: randomUUID,
    fingerprint: String,
  });
  const order = await service.checkout("owner", {
    requestKey: randomUUID(),
    items: [{ productId: "vase", quantity: 1 }],
    customer: {
      name: "Test",
      email: "test@example.com",
      phone: "0812345678",
      address: "Bangkok 123",
      postalCode: "10110",
    },
  });
  assert.match(order.id, /^\d{12}$/);
  await service.start("owner", order.id);
  await service.start("owner", order.id);
  assert.equal(created, 1);
  assert.equal(sent.payValue, "890.00");
  assert.equal(sent.refNo, order.id);
  assert.equal(sent.apiKey, undefined);
  await assert.rejects(service.cancel("owner", order.id), { status: 409 });
  assert.equal(
    (await db.listProducts()).find((p) => p.id === "vase").stock,
    23,
  );
  await assert.rejects(service.paySolutionsPostback(order.id, "bad"), {
    status: 403,
  });
  result = {
    ReferenceNo: order.id,
    MerchantID: "12345678",
    ProductDetail: `Order ${order.id}`,
    CurrencyCode: "00",
    Total: 1,
    Status: "CP",
  };
  await assert.rejects(
    service.paySolutionsPostback(order.id, gateway.token(order.id)),
    { status: 409 },
  );
  result.Total = 890;
  result.MerchantID = "99999999";
  await assert.rejects(service.refresh("owner", order.id), { status: 409 });
  result.MerchantID = "12345678";
  await service.paySolutionsPostback(order.id, gateway.token(order.id));
  await service.paySolutionsPostback(order.id, gateway.token(order.id));
  assert.equal((await service.get("owner", order.id)).status, "paid");
  assert.equal(
    (await db.listProducts()).find((p) => p.id === "vase").stock,
    23,
  );
});

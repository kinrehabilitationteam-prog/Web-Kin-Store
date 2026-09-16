import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { createRepository } from "../src/infrastructure/repository.js";
import { seed } from "../src/infrastructure/seed.js";
import { CatalogService } from "../src/application/catalog-service.js";
import { CommerceService } from "../src/application/commerce-service.js";
import { SqlOrderRepository } from "../src/infrastructure/order-repository.js";
import { DemoPaymentGateway } from "../src/infrastructure/demo-payment.js";
import { createHttpServer } from "../src/presentation/http-server.js";

test("KIN catalog contains 19 source-backed rentals and rejects sale checkout even if stock is changed", async (t) => {
  const db = await createRepository({ sqlitePath: ":memory:" });
  t.after(() => db.close());
  await seed(db);
  const products = await db.listProducts();
  assert.equal(products.length, 19);
  assert.equal((await db.listCategories()).length, 5);
  for (const p of products) {
    await access("public" + p.image);
    assert.ok(p.description.length > 30);
    assert.equal(p.catalog.priceType, "rental");
    assert.equal(p.catalog.purchaseMode, "inquiry");
    assert.equal(p.stock, 0);
    assert.ok(p.catalog.rates.length);
  }
  const service = new CatalogService(db, null, randomUUID);
  assert.equal((await service.products({ q: "KSOC-10" })).total, 1);
  const ar = await service.product("kin-ar-200");
  assert.equal(ar.catalog.rates.length, 6);
  assert.equal(ar.catalog.period, "วัน");
  assert.equal(ar.price, 900);
  const existing = await service.product("kin-ksw-5");
  await service.saveProduct({ ...existing, stock: 5 }, existing.id);
  assert.equal(
    (await service.product(existing.id)).catalog.purchaseMode,
    "inquiry",
  );
  const orders = new SqlOrderRepository(db);
  await orders.initialize();
  const commerce = new CommerceService({
    catalog: db,
    orders,
    gateway: new DemoPaymentGateway(),
    newId: randomUUID,
    fingerprint: (v) => createHash("sha256").update(v).digest("hex"),
  });
  await assert.rejects(
    () => commerce.quote([{ productId: existing.id, quantity: 1 }]),
    { status: 409 },
  );
  await assert.rejects(
    () =>
      commerce.checkout("owner", {
        items: [{ productId: existing.id, quantity: 1 }],
        requestKey: randomUUID(),
        customer: {
          name: "Test",
          email: "test@example.com",
          phone: "0812345678",
          address: "Test Bangkok",
          postalCode: "10110",
        },
      }),
    { status: 409 },
  );
  assert.equal((await service.product(existing.id)).stock, 5);
  assert.equal((await orders.list()).length, 0);
});

test("rental product page shows periods, deposits, source and enquiry actions", async (t) => {
  const db = await createRepository({ sqlitePath: ":memory:" });
  await seed(db);
  const server = createHttpServer(new CatalogService(db, null, randomUUID));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dom = new JSDOM(
      await readFile("public/storefront/index.html", "utf8"),
      { url: base + "/product/kin-ar-200", runScripts: "outside-only" },
    ),
    w = dom.window;
  t.after(async () => {
    w.close();
    await new Promise((r) => {
      server.close(r);
      server.closeAllConnections();
    });
    await db.close();
  });
  w.fetch = (path, options) => fetch(new URL(path, base), options);
  w.scrollTo = () => {};
  w.HTMLDialogElement.prototype.close = function () {};
  w.eval(
    (await readFile("public/storefront/shop.js", "utf8")).replace(
      "export function createShop",
      "window.createShop = function createShop",
    ),
  );
  w.eval(
    (await readFile("public/storefront/app.js", "utf8")).replace(
      /import \{ createShop \} from ['"]\.\/shop.js['"];?/,
      "const createShop = window.createShop;",
    ),
  );
  const until = Date.now() + 4000;
  while (!w.document.querySelector(".rental-details") && Date.now() < until)
    await new Promise((r) => setTimeout(r, 20));
  const panel = w.document.querySelector(".rental-details");
  assert.ok(panel);
  assert.match(panel.textContent, /9,400/);
  assert.match(panel.textContent, /11,000/);
  assert.equal(panel.querySelectorAll("tbody tr").length, 6);
  assert.ok(w.document.querySelector('a[href="tel:0618819399"]'));
  assert.equal(w.document.querySelector(".detail [data-add-cart]"), null);
  const photo = await fetch(base + "/assets/kin/product-0.jpg");
  assert.match(photo.headers.get("content-type"), /^image\/jpeg/);
  assert.equal(photo.status, 200);
});

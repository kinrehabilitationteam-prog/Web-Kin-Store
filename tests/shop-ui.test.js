import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { createRepository } from "../src/infrastructure/repository.js";
import { SqlOrderRepository } from "../src/infrastructure/order-repository.js";
import { seed } from "./fixtures/demo-seed.js";
import { CommerceService } from "../src/application/commerce-service.js";
import { CatalogService } from "../src/application/catalog-service.js";
import { DemoPaymentGateway } from "../src/infrastructure/demo-payment.js";
import { createHttpServer } from "../src/presentation/http-server.js";

test("UI: cart persistence, quantity/removal, checkout, demo payment, history and admin orders", async (t) => {
  const db = await createRepository({ sqlitePath: ":memory:" });
  await seed(db);
  const orders = new SqlOrderRepository(db);
  await orders.initialize();
  const commerce = new CommerceService({
    catalog: db,
    orders,
    gateway: new DemoPaymentGateway(),
    newId: randomUUID,
    fingerprint: (v) => createHash("sha256").update(v).digest("hex"),
  });
  const server = createHttpServer(new CatalogService(db, null, randomUUID), {
    commerce,
    adminPassword: "shop-test-password-123",
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dom = new JSDOM(
      await readFile("public/storefront/index.html", "utf8"),
      {
        url: base,
        runScripts: "outside-only",
      },
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
  const cookies = new Map();
  w.fetch = async (path, options = {}) => {
    const response = await fetch(new URL(path, base), {
      ...options,
      headers: {
        ...options.headers,
        cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
      },
    });
    for (const value of response.headers.getSetCookie()) {
      const entry = value.split(";")[0],
        at = entry.indexOf("=");
      cookies.set(entry.slice(0, at), entry.slice(at + 1));
    }
    return response;
  };
  w.scrollTo = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const $ = (s) => w.document.querySelector(s);
  const wait = async (condition) => {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw Error("UI timeout: " + $("#app").textContent.slice(0, 500));
  };
  const submit = (selector) =>
    $(selector).dispatchEvent(
      new w.Event("submit", { bubbles: true, cancelable: true }),
    );
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
  await wait(() => $("[data-add-cart=vase]"));
  $("[data-add-cart=vase]").click();
  await wait(() => $("#cart-count").textContent === "1");
  $("[data-add-cart=cup]").click();
  await wait(() => $("#cart-count").textContent === "2");
  assert.equal(JSON.parse(w.localStorage.getItem("baan-cart-v1")).length, 2);
  $(".cart-link").click();
  await wait(() => $(".cart-item"));
  $('[data-quantity=vase][data-step="1"]').click();
  await wait(
    () =>
      $("#cart-count").textContent === "3" &&
      $(".quantity span").textContent === "2",
  );
  $("[data-remove-cart=cup]").click();
  await wait(() => w.document.querySelectorAll(".cart-item").length === 1);
  $('a[href="/checkout"]').click();
  await wait(() => $("#checkout-form"));
  for (const [key, value] of Object.entries({
    name: "Cart UI Customer",
    email: "shop@example.com",
    phone: "0812345678",
    address: "123 Bangkok",
    postalCode: "10110",
  }))
    $(`#checkout-form [name=${key}]`).value = value;
  submit("#checkout-form");
  await wait(() => $("#demo-paid"));
  assert.equal($("#cart-count").textContent, "0");
  assert.equal(
    (await db.listProducts()).find((p) => p.id === "vase").stock,
    22,
  );
  const orderId = w.location.pathname.split("/")[2];
  $("#demo-paid").click();
  await wait(() => $(".order-status.paid"));
  assert.equal((await orders.get(orderId)).status, "paid");
  $('a[href="/orders"]').click();
  await wait(() => $("tbody")?.textContent.includes("ชำระเงินสำเร็จ"));
  w.document.documentElement.innerHTML = new JSDOM(
    await readFile("public/admin/index.html", "utf8"),
  ).window.document.documentElement.innerHTML;
  w.history.pushState({}, "", "/admin/login");
  w.eval(await readFile("public/admin/app.js", "utf8"));
  await wait(() => $("#login"));
  $("#login input").value = "shop-test-password-123";
  submit("#login");
  await wait(() => $("#add") && !$("#login"));
  $('a[href="/admin/orders"]').click();
  await wait(() => $("[data-order-details]"));
  assert.doesNotMatch($("tbody").textContent, /Cart UI Customer|123 Bangkok/);
  $("[data-order-details]").click();
  assert.equal($("#editor").open, true);
  assert.match($("#editor").textContent, /Cart UI Customer/);
  assert.match($("#editor").textContent, /123 Bangkok/);
  assert.match($("#editor").textContent, /รายการสินค้า|ยอดรวมทั้งหมด/);
  $("#close-order").click();
  assert.equal($("#editor").open, false);
});

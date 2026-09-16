import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRepository } from "../src/infrastructure/repository.js";
import { CatalogService } from "../src/application/catalog-service.js";
import { createHttpServer } from "../src/presentation/http-server.js";
import { seed } from "./fixtures/demo-seed.js";
const password = "a-test-password-123";
async function setup(t, search = null) {
  const repository = await createRepository({ sqlitePath: ":memory:" });
  await seed(repository);
  const service = new CatalogService(repository, search, randomUUID);
  t.after(() => repository.close());
  return { repository, service };
}
test("search, category filter, stock filter, sorting and pagination", async (t) => {
  const { service } = await setup(t);
  assert.equal((await service.products({ q: "BAAN-001" })).total, 1);
  assert.equal((await service.products({ q: "เซรามิก" })).total, 3);
  const result = await service.products({
    category: "lighting",
    available: "true",
  });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, "lamp");
  const sorted = await service.products({
    sort: "price-asc",
    limit: "2",
    page: "2",
  });
  assert.equal(sorted.items.length, 2);
  assert.equal(sorted.pages, 4);
  assert.equal(sorted.items[0].price, 790);
  assert.equal((await service.products({ q: "no-such-item" })).total, 0);
});
test("CRUD enforces SKU uniqueness, category integrity, validation and missing IDs", async (t) => {
  const { service } = await setup(t);
  const category = await service.saveCategory({ name: "ทดสอบ" });
  const input = {
    name: "สินค้าใหม่",
    sku: "NEW-001",
    description: "รายละเอียดทดสอบ",
    categoryId: category.id,
    price: 150.25,
    stock: 2,
  };
  const product = await service.saveProduct(input);
  assert.equal(product.categoryName, "ทดสอบ");
  await assert.rejects(() => service.saveProduct(input), { status: 409 });
  await assert.rejects(() => service.deleteCategory(category.id), {
    status: 409,
  });
  await assert.rejects(() => service.saveProduct({ ...input, price: -1 }), {
    status: 400,
  });
  await assert.rejects(() => service.saveProduct({ ...input, stock: 1.5 }), {
    status: 400,
  });
  await assert.rejects(
    () => service.saveProduct({ ...input, image: "javascript:alert(1)" }),
    { status: 400 },
  );
  await service.saveProduct({ ...input, price: 200 }, product.id);
  assert.equal((await service.product(product.id)).price, 200);
  await service.saveCategory({ name: "เปลี่ยนชื่อ" }, category.id);
  assert.equal((await service.product(product.id)).categoryName, "เปลี่ยนชื่อ");
  await service.deleteProduct(product.id);
  await service.deleteCategory(category.id);
  await assert.rejects(() => service.product(product.id), { status: 404 });
  await assert.rejects(() => service.deleteCategory("missing"), {
    status: 404,
  });
});
test("search falls back to database if Meilisearch is unavailable", async (t) => {
  const { service } = await setup(t, {
    search: async () => {
      throw Error("offline");
    },
  });
  assert.equal((await service.products({ q: "แจกัน" })).total, 2);
});
test("HTTP authentication, cookies, write access, CSRF and CRUD", async (t) => {
  const { service } = await setup(t);
  const server = createHttpServer(service, { adminPassword: password });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(
    () =>
      new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = "GET", data, cookie = "", origin) =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        cookie,
        ...(origin ? { origin } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  assert.equal((await request("/api/products")).status, 200);
  assert.equal(
    (await request("/api/categories", "POST", { name: "x" })).status,
    401,
  );
  assert.equal(
    (await request("/api/session", "POST", { password: "wrong" })).status,
    401,
  );
  const login = await request("/api/session", "POST", { password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  assert.equal(
    (await (await request("/api/session", "GET", undefined, cookie)).json())
      .authenticated,
    true,
  );
  assert.equal(
    (
      await request(
        "/api/categories",
        "POST",
        { name: "blocked" },
        cookie,
        "https://evil.example",
      )
    ).status,
    403,
  );
  const response = await request(
    "/api/categories",
    "POST",
    { name: "HTTP test" },
    cookie,
  );
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(
    (
      await request(
        "/api/categories/" + created.id,
        "DELETE",
        undefined,
        cookie,
      )
    ).status,
    200,
  );
  await request("/api/session", "DELETE", undefined, cookie);
  assert.equal(
    (await request("/api/categories", "POST", { name: "x" }, cookie)).status,
    401,
  );
  assert.equal((await request("/catalog")).status, 200);
  assert.equal((await request("/missing.js")).status, 404);
});

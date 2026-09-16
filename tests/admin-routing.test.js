import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRepository } from "../src/infrastructure/repository.js";
import { CatalogService } from "../src/application/catalog-service.js";
import { createHttpServer } from "../src/presentation/http-server.js";

test("separate entry points, guarded admin routes, login and logout", async (t) => {
  const db = await createRepository({ sqlitePath: ":memory:" });
  const server = createHttpServer(new CatalogService(db, null, randomUUID), {
    adminPassword: "routing-password-123",
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => {
      server.close(r);
      server.closeAllConnections();
    });
    await db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const store = await (await fetch(base)).text();
  assert.match(store, /\/storefront\/app.js/);
  assert.doesNotMatch(store, /\/admin\/app.js|จัดการแค็ตตาล็อก/);
  const login = await (await fetch(base + "/admin/login")).text();
  assert.match(login, /\/admin\/app.js/);
  assert.doesNotMatch(login, /\/storefront\/app.js|cart-count/);
  for (const path of [
    "/admin",
    "/admin/orders",
    "/admin/categories",
    "/admin/index.html",
  ]) {
    const response = await fetch(base + path, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.match(response.headers.get("location"), /^\/admin\/login\?next=/);
  }
  const wrong = await fetch(base + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "wrong" }),
  });
  assert.equal(wrong.status, 401);
  const authenticated = await fetch(base + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "routing-password-123" }),
  });
  const cookie = authenticated.headers.get("set-cookie").split(";")[0];
  const dashboard = await fetch(base + "/admin", {
    headers: { cookie },
    redirect: "manual",
  });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.headers.get("cache-control"), "no-store");
  const already = await fetch(base + "/admin/login", {
    headers: { cookie },
    redirect: "manual",
  });
  assert.equal(already.headers.get("location"), "/admin");
  await fetch(base + "/api/session", {
    method: "DELETE",
    headers: { cookie, "Content-Type": "application/json" },
  });
  assert.equal(
    (await fetch(base + "/admin", { headers: { cookie }, redirect: "manual" }))
      .status,
    302,
  );
  assert.doesNotMatch(
    await readFile("public/storefront/app.js", "utf8"),
    /function admin\(|function edit\(|\/api\/session/,
  );
  assert.doesNotMatch(
    await readFile("public/storefront/shop.js", "utf8"),
    /commerce\/admin|\/admin\/orders/,
  );
});

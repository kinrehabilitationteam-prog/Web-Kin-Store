import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { JSDOM } from "jsdom";
import { createRepository } from "../src/infrastructure/repository.js";
import { seed } from "./fixtures/demo-seed.js";
import { CatalogService } from "../src/application/catalog-service.js";
import { createHttpServer } from "../src/presentation/http-server.js";
test("UI: homepage → search → details → login → product/category management", async (t) => {
  const repository = await createRepository({ sqlitePath: ":memory:" });
  await seed(repository);
  const server = createHttpServer(
    new CatalogService(repository, null, randomUUID),
    { adminPassword: "ui-test-password-123" },
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const html = await readFile("public/storefront/index.html", "utf8");
  const dom = new JSDOM(html, { url: base, runScripts: "outside-only" }),
    w = dom.window;
  t.after(async () => {
    w.close();
    await new Promise((r) => {
      server.close(r);
      server.closeAllConnections();
    });
    await repository.close();
  });
  let cookie = "";
  w.fetch = async (path, options = {}) => {
    const response = await fetch(new URL(path, base), {
      ...options,
      headers: { ...options.headers, cookie },
    });
    if (response.headers.has("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
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
  async function waitFor(condition) {
    const end = Date.now() + 4000;
    while (Date.now() < end) {
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error(
      "UI condition timed out: " +
        w.document.querySelector("#app").textContent.slice(0, 250),
    );
  }
  function submit(selector) {
    $(selector).dispatchEvent(
      new w.Event("submit", { bubbles: true, cancelable: true }),
    );
  }
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
  await waitFor(() => $(".card"));
  assert.equal(w.document.querySelectorAll(".card").length, 8);
  $("#search-form input").value = "BAAN-001";
  submit("#search-form");
  await waitFor(
    () =>
      w.location.pathname === "/catalog" &&
      w.document.querySelectorAll(".card").length === 1,
  );
  $(".card .product-image").click();
  await waitFor(() => $(".detail"));
  assert.match($(".detail h1").textContent, /แจกัน/);
  w.document.documentElement.innerHTML = new JSDOM(
    await readFile("public/admin/index.html", "utf8"),
  ).window.document.documentElement.innerHTML;
  w.history.pushState({}, "", "/admin/login");
  w.eval(await readFile("public/admin/app.js", "utf8"));
  await waitFor(() => $("#login"));
  $("#toggle-password").click();
  assert.equal($("#admin-password").type, "text");
  $("#toggle-password").click();
  assert.equal($("#admin-password").type, "password");
  $("#login input").value = "wrong-password";
  submit("#login");
  await waitFor(() =>
    $("#login .error")?.textContent.includes("รหัสผ่านไม่ถูกต้อง"),
  );
  assert.equal($("#add"), null);
  $("#login input").value = "ui-test-password-123";
  submit("#login");
  await waitFor(() => $("#add"));
  $("#add").click();
  $("#edit-form [name=name]").value = "UI Test Product";
  $("#edit-form [name=sku]").value = "UI-001";
  $("#edit-form [name=price]").value = "125";
  $("#edit-form [name=stock]").value = "5";
  $("#edit-form [name=description]").value = "Created through the product form";
  submit("#edit-form");
  await waitFor(
    () =>
      !$("#editor").open && $("tbody")?.textContent.includes("UI Test Product"),
  );
  const product = (await repository.listProducts()).find(
    (p) => p.sku === "UI-001",
  );
  assert.equal(product.price, 125);
  $(`[data-edit="${product.id}"]`).click();
  $("#edit-form [name=price]").value = "175";
  submit("#edit-form");
  await waitFor(
    () => !$("#editor").open && $("tbody")?.textContent.includes("175"),
  );
  assert.equal(
    (await repository.listProducts()).find((p) => p.id === product.id).price,
    175,
  );
  $(`[data-delete="${product.id}"]`).click();
  $("#confirm").click();
  await waitFor(
    () =>
      !$("#editor").open &&
      !$("tbody")?.textContent.includes("UI Test Product"),
  );
  $('[data-admin-nav][href="/admin/categories"]').click();
  await waitFor(() => $("#add")?.textContent.includes("หมวดหมู่"));
  $("#add").click();
  $("#edit-form [name=name]").value = "UI Category";
  submit("#edit-form");
  await waitFor(
    () => !$("#editor").open && $("tbody")?.textContent.includes("UI Category"),
  );
  assert.ok(
    (await repository.listCategories()).some((c) => c.name === "UI Category"),
  );
  $("#shell-logout").click();
  await waitFor(() => $("#login"));
  assert.ok($("#login"));
});

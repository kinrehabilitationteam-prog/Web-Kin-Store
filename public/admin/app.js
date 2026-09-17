// Independent administration entry point. No storefront or cart imports.
const app = document.querySelector("#app"),
  dialog = document.querySelector("#editor");
const money = (n) =>
  "฿" + Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let categories = [],
  requestVersion = 0,
  adminTab = "products",
  toastTimer;
async function api(path, method = "GET", data) {
  const response = await fetch("/api" + path, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "ไม่สามารถเชื่อมต่อได้");
    error.status = response.status;
    if (response.status === 401 && path !== "/session")
      navigate("/admin/login", true);
    throw error;
  }
  return result;
}
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 3500);
}
function navigate(path, replace = false) {
  history[replace ? "replaceState" : "pushState"]({}, "", path);
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
document.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (
    link?.origin === location.origin &&
    /^\/admin(?:\/|$)/.test(link.pathname) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.button === 0
  ) {
    event.preventDefault();
    navigate(link.pathname + link.search);
  }
});
window.addEventListener("popstate", render);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) render();
});
document.addEventListener(
  "error",
  (event) => {
    if (
      event.target instanceof HTMLImageElement &&
      !event.target.src.endsWith("/assets/vase.svg")
    )
      event.target.src = "/assets/vase.svg";
  },
  true,
);
function login(configured) {
  document.body.classList.add("login-screen");
  app.innerHTML = `<section class="login-layout"><div class="login-panel"><a class="brand login-brand" href="/"><img src="/assets/logo-navbar.webp" alt="KIN HOMECARE" width="211" height="80"></a><form id="login" class="login"><div class="eyebrow">ADMIN SIGN IN</div><h1>เข้าสู่ระบบ</h1><p>กรอกรหัสผ่านผู้ดูแลเพื่อเริ่มจัดการร้าน</p><label class="field" for="admin-password">รหัสผ่านผู้ดูแล<div class="password-field"><input id="admin-password" type="password" name="password" autocomplete="current-password" required autofocus><button type="button" id="toggle-password" aria-label="แสดงรหัสผ่าน" aria-pressed="false">แสดง</button></div></label><p class="error" role="alert"></p>${!configured ? '<div class="notice">ระบบยังไม่พร้อมเข้าสู่ระบบ กรุณาตั้งค่า ADMIN_PASSWORD อย่างน้อย 12 ตัวอักษรใน .env แล้วเริ่มเซิร์ฟเวอร์ใหม่</div>' : ""}<button class="primary full-width" type="submit" ${configured ? "" : "disabled"}>เข้าสู่ระบบ →</button><a class="back-store" href="/">← กลับไปหน้าร้าน</a></form><p class="login-footnote">สำหรับผู้ดูแลที่ได้รับสิทธิ์เท่านั้น</p></div></section>`;
  document.querySelector("#toggle-password").onclick = (event) => {
    const input = document.querySelector("#admin-password"),
      show = input.type === "password";
    input.type = show ? "text" : "password";
    event.target.textContent = show ? "ซ่อน" : "แสดง";
    event.target.setAttribute("aria-pressed", String(show));
    event.target.setAttribute(
      "aria-label",
      show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน",
    );
  };
  document.querySelector("#login").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target,
      button = form.querySelector("[type=submit]");
    button.disabled = true;
    button.textContent = "กำลังเข้าสู่ระบบ…";
    form.querySelector(".error").textContent = "";
    try {
      await api("/session", "POST", {
        password: new FormData(form).get("password"),
      });
      const next = new URLSearchParams(location.search).get("next");
      navigate(
        ["/admin", "/admin/orders", "/admin/categories"].includes(next)
          ? next
          : "/admin",
        true,
      );
    } catch (error) {
      form.querySelector(".error").textContent = error.message;
      button.disabled = false;
      button.textContent = "เข้าสู่ระบบ →";
    }
  };
}
async function render() {
  const version = ++requestVersion;
  dialog.close();
  document.querySelector(".account-menu").open = false;
  app.setAttribute("aria-busy", "true");
  try {
    const session = await api("/session");
    if (version !== requestVersion) return;
    if (!session.authenticated) {
      if (location.pathname !== "/admin/login")
        history.replaceState(
          {},
          "",
          "/admin/login?next=" + encodeURIComponent(location.pathname),
        );
      login(session.configured);
      return;
    }
    if (location.pathname === "/admin/login")
      history.replaceState({}, "", "/admin");
    document.body.classList.remove("login-screen");
    document
      .querySelectorAll("[data-admin-nav]")
      .forEach((link) =>
        link.classList.toggle("active", link.pathname === location.pathname),
      );
    if (location.pathname === "/admin/orders") {
      await orderList(version);
      return;
    }
    if (
      !["/admin", "/admin/", "/admin/categories"].includes(location.pathname)
    ) {
      app.innerHTML =
        '<div class="empty"><h1>ไม่พบหน้าที่ต้องการ</h1><a href="/admin" class="button">กลับแดชบอร์ด</a></div>';
      return;
    }
    categories = await api("/categories");
    if (version !== requestVersion) return;
    adminTab =
      location.pathname === "/admin/categories" ? "categories" : "products";
    await admin(version);
  } catch (error) {
    if (version === requestVersion) {
      app.innerHTML = `<div class="empty"><h2>ไม่สามารถโหลดข้อมูลได้</h2><p>${esc(error.message)}</p><button id="retry">ลองอีกครั้ง</button></div>`;
      document.querySelector("#retry").onclick = render;
    }
  } finally {
    if (version === requestVersion) app.removeAttribute("aria-busy");
  }
}
document.querySelector("#shell-logout").onclick = async () => {
  try {
    await api("/session", "DELETE");
    navigate("/admin/login", true);
  } catch (error) {
    toast(error.message);
  }
};
async function orderList(version) {
  const orders = await api("/commerce/admin/orders");
  if (version !== requestVersion) return;
  const labels = {
    pending: "รอชำระเงิน",
    paid: "ชำระเงินสำเร็จ",
    failed: "ชำระไม่สำเร็จ",
    cancelled: "ยกเลิกแล้ว",
    expired: "หมดเวลา",
  };
  app.innerHTML = `<div class="section-head"><div><div class="eyebrow">ORDER MANAGEMENT</div><h1>คำสั่งซื้อทั้งหมด</h1><p>100 รายการล่าสุด · เลือกดูรายละเอียดผู้รับและสินค้า</p></div><button id="refresh-orders">รีเฟรชข้อมูล</button></div><div class="table-wrap"><table><thead><tr><th>คำสั่งซื้อ / วันที่</th><th>ยอดรวม</th><th>สถานะ</th><th>รายละเอียด</th></tr></thead><tbody>${orders.map((order) => `<tr><td>${esc(order.id.slice(0, 8).toUpperCase())}<small>${new Date(order.createdAt).toLocaleString("th-TH")}</small></td><td>${money(order.total / 100)}</td><td><span class="status-pill ${esc(order.status)}">${labels[order.status] || esc(order.status)}</span></td><td><button data-order-details="${esc(order.id)}" aria-label="ดูรายละเอียดคำสั่งซื้อ ${esc(order.id.slice(0, 8).toUpperCase())}">ดูรายละเอียด ↗</button></td></tr>`).join("")}</tbody></table>${orders.length ? "" : '<div class="empty">ยังไม่มีคำสั่งซื้อ</div>'}</div>`;
  prepareMobileTable();
  app.querySelector("table").classList.add("orders-table");
  document.querySelector("#refresh-orders").onclick = render;
  app.querySelectorAll("[data-order-details]").forEach((button) => {
    button.onclick = () => {
      const order = orders.find(
        (item) => item.id === button.dataset.orderDetails,
      );
      showOrderDetails(order, labels[order.status] || order.status);
    };
  });
}

function showOrderDetails(order, status) {
  dialog.innerHTML = `<div class="order-detail"><div class="dialog-head"><h2 id="order-detail-title">รายละเอียดคำสั่งซื้อ</h2><button type="button" class="icon-button" id="close-dialog" aria-label="ปิดรายละเอียดคำสั่งซื้อ" autofocus>×</button></div><dl class="order-info"><div><dt>เลขคำสั่งซื้อ</dt><dd>${esc(order.id)}</dd></div><div><dt>วันที่สั่งซื้อ</dt><dd>${new Date(order.createdAt).toLocaleString("th-TH")}</dd></div><div><dt>สถานะ</dt><dd>${esc(status)}</dd></div><div><dt>ช่องทางชำระเงิน</dt><dd>${order.provider === "demo" ? "จำลอง" : esc(order.provider)}</dd></div></dl><section><h3>ผู้รับและที่อยู่จัดส่ง</h3><dl class="order-info"><div><dt>ชื่อผู้รับ</dt><dd>${esc(order.customer.name)}</dd></div><div><dt>อีเมล</dt><dd>${esc(order.customer.email)}</dd></div><div><dt>โทรศัพท์</dt><dd>${esc(order.customer.phone)}</dd></div><div><dt>ที่อยู่</dt><dd class="order-address">${esc(order.customer.address)}<br>${esc(order.customer.postalCode)}</dd></div></dl></section><section><h3>รายการสินค้า (${order.items.reduce((sum, item) => sum + item.quantity, 0)} ชิ้น)</h3><ul class="order-detail-items">${order.items.map((item) => `<li><strong>${esc(item.name)}</strong><span>รหัสสินค้า ${esc(item.sku)}</span><div><span>${money(item.unitAmount / 100)} × ${item.quantity}</span><strong>${money((item.unitAmount * item.quantity) / 100)}</strong></div></li>`).join("")}</ul></section><dl class="order-totals"><div><dt>รวมค่าสินค้า</dt><dd>${money(order.subtotal / 100)}</dd></div><div><dt>ค่าจัดส่ง</dt><dd>${money(order.shipping / 100)}</dd></div><div><dt>ยอดรวมทั้งหมด</dt><dd>${money(order.total / 100)}</dd></div></dl><div class="dialog-actions"><button type="button" class="primary" id="close-order">ปิดรายละเอียด</button></div></div>`;
  dialog.setAttribute("aria-labelledby", "order-detail-title");
  dialog.onclose = () => dialog.removeAttribute("aria-labelledby");
  document.querySelector("#close-dialog").onclick = closeDialog;
  document.querySelector("#close-order").onclick = closeDialog;
  dialog.showModal();
}

async function admin(version) {
  const products = await allProducts();
  if (version !== requestVersion) return;
  app.innerHTML = `<div class="section-head"><div><div class="eyebrow">Catalog manager</div><h1>${adminTab === "products" ? "จัดการสินค้า" : "จัดการหมวดหมู่"}</h1><p>${adminTab === "products" ? "ดูข้อมูล ราคา และความพร้อมของสินค้า" : "จัดหมวดหมู่ให้ลูกค้าค้นหาสินค้าได้ง่าย"}</p></div></div><div class="section-head list-toolbar"><h2>${adminTab === "products" ? "รายการสินค้า" : "รายการหมวดหมู่"} <span class="list-count">${adminTab === "products" ? products.length : categories.length}</span></h2><button class="primary" id="add">＋ เพิ่ม${adminTab === "products" ? "สินค้า" : "หมวดหมู่"}</button></div><div class="table-wrap"><table><thead>${adminTab === "products" ? "<tr><th>สินค้า / รหัสสินค้า</th><th>หมวดหมู่</th><th>ราคา</th><th>คงเหลือ</th><th>จัดการ</th></tr>" : "<tr><th>หมวดหมู่</th><th>จำนวนสินค้า</th><th>จัดการ</th></tr>"}</thead><tbody>${adminTab === "products" ? products.map((p) => `<tr><td><div class="table-product"><img src="${esc(p.image)}" alt=""><div>${esc(p.name)}<small>${esc(p.sku)}</small></div></div></td><td>${esc(p.categoryName)}</td><td>${money(p.price)}${p.catalog ? " / " + esc(p.catalog.period) : ""}</td><td>${p.catalog ? "รอยืนยันความพร้อม" : p.stock}</td><td><button data-edit="${esc(p.id)}">แก้ไข</button><button class="danger" data-delete="${esc(p.id)}">ลบ</button></td></tr>`).join("") : categories.map((c) => `<tr><td>${esc(c.name)}</td><td>${c.count}</td><td><button data-edit="${esc(c.id)}">แก้ไข</button><button class="danger" data-delete="${esc(c.id)}">ลบ</button></td></tr>`).join("")}</tbody></table>${!(adminTab === "products" ? products : categories).length ? '<div class="empty">ยังไม่มีข้อมูล กดปุ่มเพิ่มเพื่อเริ่มต้น</div>' : ""}</div>`;
  prepareMobileTable();
  document.querySelector("#add").onclick = () => edit();
  document
    .querySelectorAll("[data-edit]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          edit(
            (adminTab === "products" ? products : categories).find(
              (p) => p.id === b.dataset.edit,
            ),
          )),
    );
  document
    .querySelectorAll("[data-delete]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          remove(
            (adminTab === "products" ? products : categories).find(
              (p) => p.id === b.dataset.delete,
            ),
          )),
    );
}
// Use the same rows and action handlers for desktop tables and mobile cards.
function prepareMobileTable() {
  const table = app.querySelector("table");
  table.classList.add("management-table");
  if (location.pathname === "/admin/categories")
    table.classList.add("categories-table");
  const headings = [...table.querySelectorAll("th")];
  headings.forEach((heading) => heading.setAttribute("scope", "col"));
  table.querySelectorAll("tbody tr").forEach((row) => {
    [...row.cells].forEach((cell, index) => {
      cell.dataset.label = headings[index].textContent;
    });
  });
}
async function allProducts() {
  let page = 1,
    result,
    items = [];
  do {
    result = await api("/products?limit=100&page=" + page);
    items.push(...result.items);
    page++;
  } while (page <= result.pages);
  return items;
}
function closeDialog() {
  dialog.close();
}
function edit(item) {
  const product = adminTab === "products";
  if (product && !categories.length) {
    toast("กรุณาเพิ่มหมวดหมู่ก่อนเพิ่มสินค้า");
    return;
  }
  dialog.innerHTML = `<form id="edit-form"><div class="dialog-head"><h2>${item ? "แก้ไข" : "เพิ่ม"}${product ? "สินค้า" : "หมวดหมู่"}</h2><button type="button" class="icon-button" id="close-dialog" aria-label="ปิด">×</button></div>${item?.catalog ? '<div class="notice">รายการเช่าจาก KIN: ราคาเป็นค่าเช่าเริ่มต้น สต็อกจริงต้องยืนยัน และการชำระออนไลน์ยังไม่เปิดสำหรับรายการนี้</div>' : ""}<label class="field">${product ? "ชื่อสินค้า" : "ชื่อหมวดหมู่"}<input name="name" maxlength="${product ? 160 : 80}" required value="${esc(item?.name || "")}"></label>${product ? `<div class="form-grid"><label class="field">รหัสสินค้า<input name="sku" maxlength="40" required value="${esc(item?.sku || "")}"></label><label class="field">หมวดหมู่<select name="categoryId">${categories.map((c) => `<option value="${esc(c.id)}" ${item?.categoryId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label><label class="field">ราคา (บาท)<input type="number" name="price" min="0" max="100000000" step="0.01" required value="${item?.price ?? ""}"></label><label class="field">จำนวนคงเหลือ<input type="number" name="stock" min="0" max="10000000" step="1" required value="${item?.stock ?? 0}"></label></div><label class="field">รายละเอียดสินค้า<textarea name="description" maxlength="4000" required>${esc(item?.description || "")}</textarea></label><label class="field">รูปภาพสินค้า<input id="product-image-file" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG, WebP (max 2 MB)</small></label><img class="image-upload-preview" id="image-upload-preview" src="${esc(item?.image || "/assets/vase.svg")}" alt="Product image preview"><input type="hidden" name="image" value="${esc(item?.image || "")}"><label class="available"><input name="featured" type="checkbox" ${item?.featured ? "checked" : ""}>แสดงป้ายคัดสรรโดย KIN HOMECARE</label>` : ""}<p class="error" role="alert"></p><div class="dialog-actions"><button type="button" id="cancel">ยกเลิก</button><button type="submit" class="primary">บันทึกข้อมูล</button></div></form>`;
  dialog.showModal();
  document.querySelector("#close-dialog").onclick = closeDialog;
  document.querySelector("#cancel").onclick = closeDialog;
  document.querySelector("#edit-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target,
      button = form.querySelector("[type=submit]"),
      data = Object.fromEntries(new FormData(form));
    if (product) data.featured = data.featured === "on";
    button.disabled = true;
    try {
      if (
        product &&
        document.querySelector("#product-image-file").files.length
      ) {
        const imageData = await readProductImage(
          document.querySelector("#product-image-file").files[0],
        );
        const uploaded = await api("/images", "POST", { data: imageData });
        data.image = uploaded.url;
      }
      await api(
        "/" + adminTab + (item ? "/" + item.id : ""),
        item ? "PUT" : "POST",
        data,
      );
      dialog.close();
      toast("บันทึกข้อมูลเรียบร้อย");
      render();
    } catch (error) {
      form.querySelector(".error").textContent = error.message;
      button.disabled = false;
    }
  };
  const fileInput = document.querySelector("#product-image-file");
  if (fileInput)
    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      const preview = document.querySelector("#image-upload-preview");
      const error = dialog.querySelector(".error");
      error.textContent = "";
      try {
        const source = file
          ? await readProductImage(file)
          : item?.image || "/assets/vase.svg";
        if (fileInput.isConnected && fileInput.files[0] === file)
          preview.src = source;
      } catch (err) {
        if (fileInput.isConnected && fileInput.files[0] === file) {
          error.textContent = err.message;
          fileInput.value = "";
          preview.src = item?.image || "/assets/vase.svg";
        }
      }
    };
}
function readProductImage(file) {
  return new Promise((resolve, reject) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return reject(new Error("กรุณาเลือกภาพ JPG, PNG หรือ WebP"));
    if (!file.size || file.size > 2 * 1024 * 1024)
      return reject(new Error("รูปภาพต้องมีขนาดไม่เกิน 2 MB"));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(new Error("อ่านรูปภาพไม่ได้ กรุณาเลือกไฟล์ใหม่"));
    reader.readAsDataURL(file);
  });
}
function remove(item) {
  dialog.innerHTML = `<div class="dialog-head"><h2>ยืนยันการลบ</h2><button class="icon-button" id="close-dialog" aria-label="ปิด">×</button></div><p>ต้องการลบ “${esc(item.name)}” หรือไม่?</p><p class="error" role="alert"></p><div class="dialog-actions"><button id="cancel">ยกเลิก</button><button id="confirm" class="danger">ลบข้อมูล</button></div>`;
  dialog.showModal();
  document.querySelector("#close-dialog").onclick = closeDialog;
  document.querySelector("#cancel").onclick = closeDialog;
  document.querySelector("#confirm").onclick = async (e) => {
    e.target.disabled = true;
    try {
      await api("/" + adminTab + "/" + item.id, "DELETE");
      dialog.close();
      toast("ลบข้อมูลเรียบร้อย");
      render();
    } catch (error) {
      dialog.querySelector(".error").textContent = error.message;
      e.target.disabled = false;
    }
  };
}
render();

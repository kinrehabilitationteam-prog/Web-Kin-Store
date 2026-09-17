import { createShop } from "./shop.js";

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
  toastTimer;
async function api(path, method = "GET", data) {
  const response = await fetch("/api" + path, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "ไม่สามารถเชื่อมต่อได้");
  return result;
}
function toast(text) {
  const el = document.querySelector("#toast");
  el.textContent = text;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 3500);
}
function navigate(href) {
  history.pushState({}, "", href);
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
document.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (
    link?.origin === location.origin &&
    !link.pathname.startsWith("/admin") &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey &&
    e.button === 0
  ) {
    e.preventDefault();
    navigate(link.href);
  }
});
const searchForm = document.querySelector("#search-form");
const searchInput = searchForm.querySelector("input");
const searchPreview = document.createElement("div");
searchPreview.className = "search-preview";
searchPreview.id = "search-preview";
searchPreview.hidden = true;
searchPreview.setAttribute("aria-label", "สินค้าที่ตรงกับคำค้น");
searchForm.append(searchPreview);
searchInput.autocomplete = "off";
searchInput.setAttribute("aria-controls", searchPreview.id);
searchInput.setAttribute("aria-expanded", "false");
let previewTimer,
  previewVersion = 0;
function closeSearchPreview() {
  clearTimeout(previewTimer);
  ++previewVersion;
  searchPreview.hidden = true;
  searchInput.setAttribute("aria-expanded", "false");
}
function previewMessage(text) {
  searchPreview.innerHTML = `<p class="search-preview-message" role="status">${esc(text)}</p>`;
  searchPreview.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
}
function scheduleSearchPreview() {
  closeSearchPreview();
  const q = searchInput.value.trim();
  if (!q) return;
  const version = previewVersion;
  previewMessage("กำลังค้นหาสินค้า…");
  previewTimer = setTimeout(async () => {
    try {
      const result = await api(
        "/products?" + new URLSearchParams({ q, limit: "5" }),
      );
      if (version !== previewVersion) return;
      searchPreview.innerHTML = `<p class="search-preview-message" role="status">${result.total ? `พบ ${Number(result.total)} รายการ` : "ไม่พบสินค้า ลองเปลี่ยนคำค้น"}</p>${result.items.map((p) => `<a class="search-preview-item" href="/product/${encodeURIComponent(p.id)}"><img src="${esc(p.image)}" alt=""><span><strong>${esc(p.name)}</strong><small>${p.catalog ? "เริ่ม " : ""}${money(p.price)}${p.catalog ? ` / ${esc(p.catalog.period)}` : ""}</small></span></a>`).join("")}${result.total ? `<a class="search-preview-all" href="/catalog?${esc(new URLSearchParams({ q }).toString())}">ดูผลการค้นหาทั้งหมด →</a>` : ""}`;
    } catch {
      if (version === previewVersion)
        previewMessage("โหลดตัวอย่างไม่ได้ กรุณากดค้นหาเพื่อลองอีกครั้ง");
    }
  }, 250);
}
searchInput.addEventListener("input", (e) => {
  if (!e.isComposing) scheduleSearchPreview();
});
searchInput.addEventListener("compositionstart", closeSearchPreview);
searchInput.addEventListener("compositionend", scheduleSearchPreview);
searchInput.addEventListener("focus", scheduleSearchPreview);
searchForm.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    searchInput.focus();
    closeSearchPreview();
    e.preventDefault();
  }
  if (searchPreview.hidden || !["ArrowDown", "ArrowUp"].includes(e.key)) return;
  const links = [...searchPreview.querySelectorAll("a")];
  if (!links.length) return;
  e.preventDefault();
  const index = links.indexOf(document.activeElement);
  const next =
    e.key === "ArrowDown"
      ? (index + 1) % links.length
      : index <= 0
        ? links.length - 1
        : index - 1;
  links[next].focus();
});
searchForm.addEventListener("focusout", (e) => {
  if (!searchForm.contains(e.relatedTarget)) closeSearchPreview();
});
document.addEventListener("pointerdown", (e) => {
  if (!searchForm.contains(e.target)) closeSearchPreview();
});
searchForm.onsubmit = (e) => {
  e.preventDefault();
  navigate(
    catalogLink({ q: new FormData(e.target).get("q").trim(), page: "" }),
  );
};

const shop = createShop({ app, api, esc, money, navigate, toast });
window.addEventListener("popstate", render);
function catalogLink(changes = {}) {
  const params = new URLSearchParams(
    location.pathname === "/catalog" ? location.search : "",
  );
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return "/catalog" + (params.size ? "?" + params : "");
}
function card(p) {
  if (p.catalog)
    return `<article class="card"><a class="product-image" href="/product/${esc(p.id)}"><span class="badge">อุปกรณ์ให้เช่า</span><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"></a><div class="card-category">${esc(p.categoryName)}</div><h3><a href="/product/${esc(p.id)}">${esc(p.name)}</a></h3><div class="price-row"><span>เริ่ม ${money(p.price)}<small> / ${esc(p.catalog.period)}</small></span></div><a class="button add-cart" href="/product/${esc(p.id)}">รายละเอียดและอัตราเช่า ↗</a></article>`;
  return `<article class="card"><a class="product-image" href="/product/${esc(p.id)}" aria-label="ดู ${esc(p.name)}">${!p.stock ? '<span class="badge sold">สินค้าหมด</span>' : p.featured ? '<span class="badge">คัดสรรโดย KIN HOMECARE</span>' : ""}<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"></a><div class="card-category">${esc(p.categoryName)}</div><h3><a href="/product/${esc(p.id)}">${esc(p.name)}</a></h3><div class="price-row"><span>${money(p.price)}</span><a href="/product/${esc(p.id)}">ดูรายละเอียด ↗</a></div><button class="add-cart" data-add-cart="${esc(p.id)}" ${!p.stock ? "disabled" : ""}>${p.stock ? "＋ เพิ่มลงตะกร้า" : "สินค้าหมด"}</button></article>`;
}
function hero() {
  return '<section class="hero medical-hero"><div class="hero-copy"><div class="eyebrow">KIN HOMECARE · MEDICAL EQUIPMENT</div><h1>อุปกรณ์ดูแลผู้ป่วย<br>เพื่อการดูแลที่บ้าน</h1><p>เลือกชมเตียงผู้ป่วย รถเข็น และเครื่องผลิตออกซิเจน<br>พร้อมรายละเอียดรุ่น ค่าเช่า และเงื่อนไขบริการ</p><a class="button primary" href="/catalog">ดูอุปกรณ์ทั้งหมด ↗</a></div><div class="hero-art medical-hero-art"><img src="/assets/kin/product-0.jpg" alt="ชุดเตียงผู้ป่วยไฟฟ้า ALLWELL KS-828b"></div></section><div class="values"><span><b>▦</b> เตียงและอุปกรณ์ดูแลผู้ป่วย</span><span><b>◌</b> แสดงค่าเช่าและมัดจำ</span><span><b>☎</b> สอบถาม 061-881-9399</span></div>';
}
function categoryTiles(products) {
  return `<section class="category-discovery" aria-labelledby="category-title"><div class="section-head"><div><div class="eyebrow">เลือกตามประเภทอุปกรณ์</div><h2 id="category-title">เริ่มจากสิ่งที่คุณต้องการ</h2></div></div><div class="category-grid">${categories
    .map((category) => {
      const product = products.find((p) => p.categoryId === category.id);
      return `<a class="category-tile" href="/catalog?category=${encodeURIComponent(category.id)}"><img src="${esc(product?.image || "/assets/logo-navbar.webp")}" alt="" loading="lazy"><div><h3>${esc(category.name)}</h3><span>${Number(category.count)} รายการ <b aria-hidden="true">↗</b></span></div></a>`;
    })
    .join("")}</div></section>`;
}
function rentalPanel(p) {
  const c = p.catalog;
  if (!c) return "";
  return (
    '<section class="rental-details"><h2>อัตราค่าเช่าและเงินมัดจำ</h2><div class="table-wrap"><table><thead><tr><th>รูปแบบ</th><th>ค่าเช่า</th><th>มัดจำ</th></tr></thead><tbody>' +
    c.rates
      .map(
        (r) =>
          "<tr><td>" +
          esc(r.label) +
          "</td><td>" +
          money(r.price) +
          " / " +
          esc(r.period) +
          "</td><td>" +
          (r.deposit === null ? "สอบถาม" : money(r.deposit)) +
          "</td></tr>",
      )
      .join("") +
    '</tbody></table></div><details class="rental-terms" open><summary>เงื่อนไขการเช่าและการจัดส่ง</summary><p>' +
    esc(c.terms) +
    '</p><p>ราคาซื้อขาดและจำนวนพร้อมให้เช่าต้องสอบถามเจ้าหน้าที่ ราคาข้างต้นยังไม่รวมเงินมัดจำและค่าจัดส่งที่อาจมีตามเงื่อนไข</p><a class="small-link" href="' +
    esc(c.sourceUrl) +
    '" target="_blank" rel="noopener noreferrer">ข้อมูลจาก KIN HomeCare ↗</a><small>ตรวจข้อมูล ' +
    esc(c.importedAt) +
    "</small></details></section>"
  );
}

async function render() {
  closeSearchPreview();
  const version = ++requestVersion;
  dialog.close();
  const activePage =
    location.pathname === "/"
      ? "home"
      : location.pathname.startsWith("/orders")
        ? "orders"
        : /^\/(catalog|product)(\/|$)/.test(location.pathname)
          ? "catalog"
          : "";
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const active = a.dataset.nav === activePage;
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.querySelector("#search-form input").value =
    new URLSearchParams(location.search).get("q") || "";
  app.setAttribute("aria-busy", "true");
  try {
    categories = await api("/categories");
    if (version !== requestVersion) return;
    if (shop.handles(location.pathname))
      await shop.render(location.pathname, () => version === requestVersion);
    else if (location.pathname.startsWith("/product/"))
      await detail(location.pathname.split("/")[2], version);
    else if (["/", "/catalog"].includes(location.pathname))
      await catalog(version);
    else
      app.innerHTML =
        '<div class="empty"><h2>ไม่พบหน้าที่ต้องการ</h2><a class="button primary" href="/">กลับหน้าแรก</a></div>';
  } catch (error) {
    if (version === requestVersion) {
      app.innerHTML = `<div class="empty"><h2>ไม่สามารถแสดงข้อมูลได้</h2><p>${esc(error.message)}</p><button id="retry">ลองอีกครั้ง</button> <a class="button" href="/catalog">กลับไปดูสินค้า</a></div>`;
      document.querySelector("#retry").onclick = render;
    }
  } finally {
    if (version === requestVersion) app.removeAttribute("aria-busy");
  }
}
async function catalog(version) {
  const home = location.pathname === "/",
    params = new URLSearchParams(location.search);
  const result = await api("/products?" + (home ? "limit=8" : params));
  if (version !== requestVersion) return;
  const previews = home ? await api("/products?limit=100") : null;
  if (version !== requestVersion) return;
  const selected = params.get("category") || "";
  app.innerHTML = `${home ? hero() + categoryTiles(previews.items) : '<div class="breadcrumb"><a href="/">หน้าแรก</a> / สินค้าทั้งหมด</div>'}<section aria-labelledby="catalog-title"><div class="section-head"><div><div class="eyebrow">อุปกรณ์การแพทย์ให้เช่า</div><h${home ? "2" : "1"} id="catalog-title">${home ? "เลือกอุปกรณ์สำหรับการดูแลที่บ้าน" : "สินค้าทั้งหมด"}</h${home ? "2" : "1"}><p>ดูรายละเอียดรุ่น ระยะเวลาเช่า และเงินมัดจำ</p></div>${home ? '<a class="small-link" href="/catalog">ดูสินค้าทั้งหมด ↗</a>' : ""}</div>${home ? "" : `<label class="category-filter" for="category-filter"><span>หมวดหมู่สินค้า</span><select id="category-filter"><option value="">ทุกหมวดหมู่ (${categories.reduce((n, c) => n + Number(c.count), 0)})</option>${categories.map((c) => `<option value="${esc(c.id)}" ${selected === c.id ? "selected" : ""}>${esc(c.name)} (${c.count})</option>`).join("")}</select></label>`}<div class="toolbar"><label class="available"><input type="checkbox" id="available" ${params.get("available") === "true" ? "checked" : ""}>เฉพาะสินค้าพร้อมจำหน่าย</label><select id="sort" aria-label="เรียงลำดับสินค้า">${[
    ["newest", "เรียงตาม: มาใหม่"],
    ["price-asc", "ราคา: ต่ำไปสูง"],
    ["price-desc", "ราคา: สูงไปต่ำ"],
    ["name", "ชื่อสินค้า: ก–ฮ"],
  ]
    .map(
      ([v, t]) =>
        `<option value="${v}" ${params.get("sort") === v ? "selected" : ""}>${t}</option>`,
    )
    .join(
      "",
    )}</select></div><div class="result-count">พบ ${result.total} รายการ${params.get("q") ? " สำหรับ “" + esc(params.get("q")) + "”" : ""}</div><div class="grid">${result.items.length ? result.items.map(card).join("") : '<div class="empty"><h2>ยังไม่พบสินค้าที่คุณค้นหา</h2><p>ลองเปลี่ยนคำค้น หรือเลือกหมวดหมู่อื่น</p><a class="button" href="/catalog">ล้างตัวกรอง</a></div>'}</div>${!home && result.pages > 1 ? `<div class="pagination"><button id="prev" ${result.page <= 1 ? "disabled" : ""}>← ก่อนหน้า</button><span>หน้า ${result.page} / ${result.pages}</span><button id="next" ${result.page >= result.pages ? "disabled" : ""}>ถัดไป →</button></div>` : ""}</section>${home ? '<section class="story"><div><h3>ต้องการข้อมูลก่อนเลือกอุปกรณ์?</h3><p>ติดต่อ KIN HomeCare 061-881-9399 เพื่อยืนยันราคาและความพร้อม</p></div><a class="small-link" href="/catalog">เลือกชมสินค้า ↗</a></section>' : ""}`;
  if (document.querySelector("#category-filter"))
    document.querySelector("#category-filter").onchange = (e) =>
      navigate(catalogLink({ category: e.target.value, page: "" }));
  document.querySelector("#sort").onchange = (e) =>
    navigate(catalogLink({ sort: e.target.value, page: "" }));
  document.querySelector("#available").onchange = (e) =>
    navigate(
      catalogLink({ available: e.target.checked ? "true" : "", page: "" }),
    );
  if (!home && result.pages > 1) {
    document.querySelector("#prev").onclick = () =>
      navigate(catalogLink({ page: result.page - 1 }));
    document.querySelector("#next").onclick = () =>
      navigate(catalogLink({ page: result.page + 1 }));
  }
}
async function detail(id, version) {
  const p = await api("/products/" + encodeURIComponent(id)),
    related = await api(
      "/products?category=" + encodeURIComponent(p.categoryId) + "&limit=5",
    );
  if (version !== requestVersion) return;
  app.innerHTML = `<div class="breadcrumb"><a href="/">หน้าแรก</a> / <a href="/catalog">สินค้า</a> / ${esc(p.name)}</div><section class="detail"><div class="product-image"><img src="${esc(p.image)}" alt="${esc(p.name)}"></div><div class="detail-copy"><a class="eyebrow" href="/catalog?category=${esc(p.categoryId)}">${esc(p.categoryName)}</a><h1>${esc(p.name)}</h1><div class="price">${p.catalog ? "ค่าเช่าเริ่ม " : ""}${money(p.price)}${p.catalog ? " / " + esc(p.catalog.period) : ""}</div><span class="stock">${p.catalog ? "สอบถามจำนวนพร้อมให้เช่ากับเจ้าหน้าที่" : p.stock ? "พร้อมจำหน่าย " + p.stock + " ชิ้น" : "สินค้าหมดชั่วคราว"}</span><section class="product-overview"><h2>รายละเอียดและคุณสมบัติ</h2><p>${esc(p.description)}</p></section><div class="specs"><div><span>รหัสสินค้า</span><span>${esc(p.sku)}</span></div><div><span>หมวดหมู่</span><a href="/catalog?category=${esc(p.categoryId)}">${esc(p.categoryName)} ↗</a></div></div>${p.catalog ? `<div class="purchase-actions"><a class="button primary" href="tel:${esc(p.catalog.phone)}">โทรสอบถามการเช่า</a><a class="button" href="${esc(p.catalog.contactUrl)}" target="_blank" rel="noopener noreferrer">สอบถามผ่าน LINE ↗</a></div>${rentalPanel(p)}` : `<div class="purchase-actions"><button class="primary" data-add-cart="${esc(p.id)}" ${!p.stock ? "disabled" : ""}>${p.stock ? "＋ เพิ่มลงตะกร้า" : "สินค้าหมด"}</button><a class="button" href="/cart">ดูตะกร้า →</a></div>`}<p><a class="small-link" href="/catalog">← กลับไปเลือกชมสินค้า</a></p></div></section><div class="section-head"><div><div class="eyebrow">You may also like</div><h2>อุปกรณ์ในหมวดหมู่เดียวกัน</h2></div></div><div class="grid">${
    related.items
      .filter((item) => item.id !== p.id)
      .slice(0, 4)
      .map(card)
      .join("") || '<p class="result-count">ยังไม่มีสินค้าอื่นในหมวดหมู่นี้</p>'
  }</div>`;
}

document.addEventListener(
  "error",
  (e) => {
    if (
      e.target instanceof HTMLImageElement &&
      !e.target.src.endsWith("/assets/vase.svg")
    )
      e.target.src = "/assets/vase.svg";
  },
  true,
);
render();

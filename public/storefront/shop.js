export function createShop({ app, api, esc, money, navigate, toast }) {
  const paymentInstructions = (config) =>
    config.provider === "paysolutions"
      ? "เลือกช่องทางชำระเงินบนหน้า Pay Solutions เมื่อเปิดรายการชำระแล้ว หากต้องการยกเลิกกรุณาติดต่อร้าน"
      : config.provider === "demo"
        ? "ทดลองได้โดยไม่ใช้บัตรหรือข้อมูลธนาคาร"
        : config.testMode
          ? "ใช้บัตรทดสอบบนหน้า Stripe Checkout"
          : "กรอกข้อมูลบัตรบนหน้าชำระเงินของ Stripe";
  const cartKey = "baan-cart-v1",
    attemptKey = "baan-checkout-attempt";
  let memory = [],
    pendingKey = "",
    cartVersion = 0;
  const labels = {
    pending: "รอชำระเงิน",
    paid: "ชำระเงินสำเร็จ",
    cancelled: "ยกเลิกแล้ว",
    expired: "หมดเวลาชำระ",
    failed: "ชำระเงินไม่สำเร็จ",
  };
  const amount = (n) => money(n / 100);
  function readCart() {
    try {
      const data = JSON.parse(localStorage.getItem(cartKey) || "[]");
      if (Array.isArray(data))
        memory = data
          .filter(
            (i) =>
              i &&
              typeof i.productId === "string" &&
              Number.isInteger(i.quantity) &&
              i.quantity > 0 &&
              i.quantity <= 99,
          )
          .slice(0, 50);
    } catch {
      /* Private mode can disable localStorage; retain the in-memory cart. */
    }
    return memory;
  }
  function badge() {
    const count = document.querySelector("#cart-count");
    if (count)
      count.textContent = readCart().reduce((n, i) => n + i.quantity, 0);
  }
  function saveCart(items) {
    memory = items;
    cartVersion++;
    pendingKey = "";
    try {
      localStorage.setItem(cartKey, JSON.stringify(items));
      sessionStorage.removeItem(attemptKey);
    } catch {}
    badge();
  }
  function getRequestKey() {
    if (!pendingKey) {
      try {
        pendingKey = sessionStorage.getItem(attemptKey) || "";
      } catch {}
      pendingKey ||= crypto.randomUUID();
      try {
        sessionStorage.setItem(attemptKey, pendingKey);
      } catch {}
    }
    return pendingKey;
  }
  window.addEventListener("storage", (e) => {
    if (e.key === cartKey) {
      cartVersion++;
      badge();
      if (location.pathname === "/cart") navigate("/cart");
    }
  });
  document.addEventListener("click", async (e) => {
    const button = e.target.closest("[data-add-cart]");
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      const product = await api(
          "/products/" + encodeURIComponent(button.dataset.addCart),
        ),
        cart = readCart(),
        existing = cart.find((i) => i.productId === product.id);
      if ((existing?.quantity || 0) + 1 > Math.min(product.stock, 99))
        throw new Error("จำนวนในตะกร้าถึงสต็อกที่มีแล้ว");
      if (existing) existing.quantity++;
      else cart.push({ productId: product.id, quantity: 1 });
      saveCart(cart);
      toast("เพิ่มสินค้าลงตะกร้าแล้ว");
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  });
  badge();
  const summary = (quote) =>
    `<div class="summary-line"><span>ยอดสินค้า</span><span>${amount(quote.subtotal)}</span></div><div class="summary-line"><span>ค่าจัดส่ง</span><span>${quote.shipping ? amount(quote.shipping) : "ฟรี"}</span></div><div class="summary-line total"><strong>ยอดรวม</strong><strong>${amount(quote.total)}</strong></div>`;
  const heading = (label, title) =>
    `<div class="breadcrumb"><a href="/">หน้าแรก</a> / ${label}</div><div class="section-head"><div><div class="eyebrow">Thoughtful things, coming home</div><h1>${title}</h1></div><a class="small-link" href="/orders">คำสั่งซื้อของฉัน ↗</a></div>`;
  const lineItems = (order) =>
    order.items
      .map(
        (i) =>
          `<div class="order-item"><img src="${esc(i.image)}" alt=""><div><strong>${esc(i.name)}</strong><small>${esc(i.sku)} · ${i.quantity} ชิ้น × ${amount(i.unitAmount)}</small></div><span>${amount(i.quantity * i.unitAmount)}</span></div>`,
      )
      .join("");

  async function cartPage(current) {
    const items = readCart();
    if (!items.length) {
      app.innerHTML =
        heading("ตะกร้า", "ตะกร้าสินค้า") +
        '<div class="empty"><h2>ตะกร้าของคุณยังว่างอยู่</h2><p>เลือกสิ่งที่ชอบ แล้วเพิ่มลงตะกร้าได้เลย</p><a class="button primary" href="/catalog">เลือกชมสินค้า ↗</a></div>';
      return;
    }
    const rows = await Promise.all(
      items.map(async (item) => {
        try {
          return {
            ...item,
            product: await api(
              "/products/" + encodeURIComponent(item.productId),
            ),
          };
        } catch {
          return { ...item, product: null };
        }
      }),
    );
    let quote = null,
      error = "";
    try {
      quote = await api("/commerce/quote", "POST", { items });
    } catch (e) {
      error = e.message;
    }
    if (!current()) return;
    app.innerHTML =
      heading("ตะกร้า", "ตะกร้าสินค้า") +
      `<div class="checkout-layout"><section class="cart-list" aria-label="สินค้าในตะกร้า">${rows.map(({ productId, quantity, product: p }) => `<article class="cart-item"><img src="${esc(p?.image || "/assets/vase.svg")}" alt="${esc(p?.name || "สินค้าไม่พร้อมจำหน่าย")}"><div class="cart-item-info"><a href="/product/${esc(productId)}">${esc(p?.name || "ไม่พบสินค้า")}</a><p>${p ? money(p.price) : "—"}</p><div class="quantity"><button data-quantity="${esc(productId)}" data-step="-1" aria-label="ลดจำนวน ${esc(p?.name || "สินค้า")}" ${quantity <= 1 ? "disabled" : ""}>−</button><span>${quantity}</span><button data-quantity="${esc(productId)}" data-step="1" aria-label="เพิ่มจำนวน ${esc(p?.name || "สินค้า")}" ${!p || quantity >= Math.min(p.stock, 99) ? "disabled" : ""}>＋</button></div>${!p || p.stock < quantity ? '<p class="error">สินค้าไม่เพียงพอ กรุณาลดจำนวนหรือนำออก</p>' : ""}</div><div class="cart-item-end"><strong>${p ? money(p.price * quantity) : "—"}</strong><button class="text-button danger" data-remove-cart="${esc(productId)}">นำออก</button></div></article>`).join("")}<a class="small-link" href="/catalog">← เลือกซื้อสินค้าต่อ</a></section><aside class="order-summary"><h2>สรุปคำสั่งซื้อ</h2>${quote ? summary(quote) : `<p class="error">${esc(error)}</p>`}${quote ? '<a class="button primary full-width" href="/checkout">ดำเนินการสั่งซื้อ →</a>' : '<button class="full-width" disabled>กรุณาตรวจสอบตะกร้า</button>'}<p class="muted-note">ตรวจราคาและจำนวนสินค้าอีกครั้งเมื่อยืนยันคำสั่งซื้อ</p></aside></div>`;
    app.querySelectorAll("[data-quantity]").forEach(
      (button) =>
        (button.onclick = () => {
          const cart = readCart(),
            item = cart.find((i) => i.productId === button.dataset.quantity);
          if (item) item.quantity += Number(button.dataset.step);
          saveCart(cart);
          navigate("/cart");
        }),
    );
    app.querySelectorAll("[data-remove-cart]").forEach(
      (button) =>
        (button.onclick = () => {
          saveCart(
            readCart().filter((i) => i.productId !== button.dataset.removeCart),
          );
          navigate("/cart");
        }),
    );
  }

  async function checkoutPage(current) {
    const items = readCart();
    if (!items.length) {
      navigate("/cart");
      return;
    }
    const version = cartVersion;
    const [quote, config] = await Promise.all([
      api("/commerce/quote", "POST", { items }),
      api("/commerce/config"),
    ]);
    if (!current()) return;
    app.innerHTML =
      heading("สั่งซื้อ", "ข้อมูลจัดส่งและการชำระเงิน") +
      `<form id="checkout-form" class="checkout-layout"><section class="checkout-fields"><h2>01 · ข้อมูลผู้รับ</h2><div class="form-grid"><label class="field">ชื่อ–นามสกุล<input name="name" autocomplete="name" maxlength="120" required></label><label class="field">อีเมล<input type="email" name="email" autocomplete="email" maxlength="254" required></label><label class="field">เบอร์โทรศัพท์<input type="tel" name="phone" autocomplete="tel" maxlength="30" required></label><label class="field">รหัสไปรษณีย์<input name="postalCode" autocomplete="postal-code" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" required></label></div><label class="field">ที่อยู่จัดส่ง (ประเทศไทย)<textarea name="address" autocomplete="street-address" maxlength="1000" required placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด"></textarea></label><h2>02 · ช่องทางชำระเงิน</h2><div class="payment-method"><span>◈</span><div><strong>${esc(config.label)}</strong><p>${esc(paymentInstructions(config))}</p></div></div>${config.testMode ? '<div class="notice">โหมดทดสอบ — ไม่มีการเรียกเก็บเงินจริง</div>' : ""}<p class="muted-note">จัดส่งฟรี · ระบบจะจองสินค้าให้ 60 นาทีหลังยืนยันคำสั่งซื้อ</p></section><aside class="order-summary"><h2>รายการสั่งซื้อ</h2>${lineItems(quote)}${summary(quote)}<p class="error" role="alert" id="checkout-error"></p><button class="primary full-width" type="submit" ${!config.enabled ? "disabled" : ""}>ยืนยันคำสั่งซื้อ →</button>${!config.enabled ? '<p class="error">ยังไม่เปิดรับชำระเงิน</p>' : ""}<a class="small-link" href="/cart">กลับไปแก้ไขตะกร้า</a></aside></form>`;
    app.querySelector("#checkout-form").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target,
        button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        if (version !== cartVersion)
          throw new Error("ตะกร้ามีการเปลี่ยนแปลง กรุณากลับไปตรวจสอบตะกร้า");
        const customer = Object.fromEntries(new FormData(form));
        const order = await api("/commerce/orders", "POST", {
          items,
          customer,
          requestKey: getRequestKey(),
        });
        // Remove only the ordered quantities, preserving additions from other tabs.
        saveCart(
          readCart()
            .map((item) => ({
              ...item,
              quantity:
                item.quantity -
                (items.find((i) => i.productId === item.productId)?.quantity ||
                  0),
            }))
            .filter((i) => i.quantity > 0),
        );
        navigate("/orders/" + order.id);
      } catch (error) {
        form.querySelector("#checkout-error").textContent = error.message;
        button.disabled = false;
      }
    };
  }

  async function orderPage(id, current) {
    const [order, config] = await Promise.all([
      api("/commerce/orders/" + id),
      api("/commerce/config"),
    ]);
    if (!current()) return;
    const pending = order.status === "pending";
    app.innerHTML =
      heading("คำสั่งซื้อ", "รายละเอียดคำสั่งซื้อ") +
      `<div class="order-status ${esc(order.status)}"><div><span class="eyebrow">ORDER ${esc(order.id.slice(0, 8).toUpperCase())}</span><h2>${labels[order.status] || esc(order.status)}</h2><p>${order.provider === "demo" ? "รายการจำลอง · ไม่มีการเรียกเก็บเงินจริง" : config.testMode ? "Stripe โหมดทดสอบ".replace("Stripe", config.provider === "paysolutions" ? "Pay Solutions" : "Stripe") : "ชำระผ่าน Stripe".replace("Stripe", config.provider === "paysolutions" ? "Pay Solutions" : "Stripe")}</p></div><span class="status-symbol">${order.status === "paid" ? "✓" : pending ? "◷" : "—"}</span></div><div class="checkout-layout"><section class="checkout-fields"><h2>รายการสินค้า</h2>${lineItems(order)}<h2>ข้อมูลจัดส่ง</h2><div class="shipping-address"><strong>${esc(order.customer.name)}</strong><p>${esc(order.customer.address)} ${esc(order.customer.postalCode)}</p><p>${esc(order.customer.phone)} · ${esc(order.customer.email)}</p></div><p class="muted-note">รหัสคำสั่งซื้อ: ${esc(order.id)}</p></section><aside class="order-summary"><h2>สรุปยอดชำระ</h2>${summary(order)}${pending ? `<p class="muted-note">ชำระภายใน ${new Date(order.expiresAt).toLocaleString("th-TH")}</p>${order.provider === "demo" ? '<div class="notice">ทดสอบผลการชำระเงิน<br>ไม่ต้องกรอกข้อมูลบัตร</div><button class="primary full-width" id="demo-paid">จำลองชำระเงินสำเร็จ</button><button class="full-width" id="demo-failed">จำลองชำระเงินไม่สำเร็จ</button>' : '<button class="primary full-width" id="pay-order">ไปชำระเงินกับ ' + esc(config.provider === "paysolutions" ? "Pay Solutions" : "Stripe") + " ↗</button>"}<button class="full-width" id="refresh-order">ตรวจสอบสถานะชำระเงิน</button><button class="text-button danger" id="cancel-order">ยกเลิกคำสั่งซื้อ</button>` : '<a class="button primary full-width" href="/catalog">เลือกซื้อสินค้าต่อ</a>'}<p class="error" id="payment-error" role="alert"></p></aside></div>`;
    async function action(action, data = {}) {
      const buttons = [...app.querySelectorAll("button")];
      buttons.forEach((b) => (b.disabled = true));
      try {
        const updated = await api(
          "/commerce/orders/" + id + "/" + action,
          "POST",
          data,
        );
        if (!current()) return;
        if (
          action === "pay" &&
          (updated.checkoutUrl?.startsWith("https://checkout.stripe.com/") ||
            (updated.provider === "paysolutions" &&
              updated.checkoutUrl?.startsWith("https://pay.sn/")))
        ) {
          window.location.assign(updated.checkoutUrl);
          return;
        }
        navigate("/orders/" + id);
      } catch (error) {
        if (current()) {
          app.querySelector("#payment-error").textContent = error.message;
          buttons.forEach((b) => (b.disabled = false));
        }
      }
    }
    if (pending) {
      app
        .querySelector("#demo-paid")
        ?.addEventListener("click", () =>
          action("simulate", { outcome: "paid" }),
        );
      app
        .querySelector("#demo-failed")
        ?.addEventListener("click", () =>
          action("simulate", { outcome: "failed" }),
        );
      app
        .querySelector("#pay-order")
        ?.addEventListener("click", () => action("pay"));
      app.querySelector("#refresh-order").onclick = () => action("refresh");
      app.querySelector("#cancel-order").onclick = () => {
        const dialog = document.querySelector("#editor");
        dialog.innerHTML =
          '<h2>ยกเลิกคำสั่งซื้อนี้?</h2><p>ระบบจะคืนสินค้าที่จองไว้ให้ร้าน</p><div class="dialog-actions"><button id="keep-order">เก็บคำสั่งซื้อไว้</button><button class="danger" id="confirm-cancel-order">ยืนยันยกเลิก</button></div>';
        dialog.showModal();
        dialog.querySelector("#keep-order").onclick = () => dialog.close();
        dialog.querySelector("#confirm-cancel-order").onclick = () => {
          dialog.close();
          action("cancel");
        };
      };
      if (new URLSearchParams(location.search).get("payment"))
        await action("refresh");
    }
  }

  async function orderList(current) {
    const orders = await api("/commerce/orders");
    if (!current()) return;
    app.innerHTML =
      heading("คำสั่งซื้อ", "คำสั่งซื้อของฉัน") +
      `<p class="muted-note">แสดงคำสั่งซื้อจากเบราว์เซอร์นี้ สูงสุด 100 รายการล่าสุด</p><div class="table-wrap"><table><thead><tr><th>คำสั่งซื้อ / วันที่</th><th>รายการ</th><th>ยอดรวม</th><th>ช่องทาง</th><th>สถานะ</th><th></th></tr></thead><tbody>${orders.map((order) => `<tr><td>${esc(order.id.slice(0, 8).toUpperCase())}<small class="block-note">${new Date(order.createdAt).toLocaleString("th-TH")}</small></td><td>${order.items.reduce((n, item) => n + item.quantity, 0)} ชิ้น</td><td>${amount(order.total)}</td><td>${order.provider === "demo" ? "จำลอง" : esc(order.provider)}</td><td><span class="status-pill ${esc(order.status)}">${labels[order.status] || esc(order.status)}</span></td><td><a class="small-link" href="/orders/${esc(order.id)}">รายละเอียด ↗</a></td></tr>`).join("")}</tbody></table>${orders.length ? "" : '<div class="empty">ยังไม่มีคำสั่งซื้อ <a class="small-link" href="/catalog">เลือกชมสินค้า</a></div>'}</div>`;
  }

  return {
    handles: (path) =>
      ["/cart", "/checkout", "/orders"].includes(path) ||
      /^\/orders\/[^/]+$/.test(path),
    async render(path, current) {
      if (path === "/cart") return cartPage(current);
      if (path === "/checkout") return checkoutPage(current);
      if (path === "/orders") return orderList(current);
      return orderPage(path.split("/")[2], current);
    },
  };
}

import { CatalogError } from "../domain/catalog.js";
import { cartInput, checkoutInput, quoteProducts } from "../domain/order.js";

export class CommerceService {
  constructor({ catalog, orders, gateway, newId, fingerprint }) {
    Object.assign(this, { catalog, orders, gateway, newId, fingerprint });
  }
  config() {
    return {
      provider: this.gateway.provider,
      label: this.gateway.label,
      testMode: this.gateway.testMode,
      enabled: this.gateway.enabled,
      shipping: 0,
      currency: "thb",
    };
  }
  async quote(items) {
    return quoteProducts(cartInput(items), await this.catalog.listProducts());
  }
  publicOrder(order) {
    const { owner, requestKey, fingerprint, ...result } = order;
    return result;
  }
  async checkout(owner, input) {
    if (!this.gateway.enabled)
      throw new CatalogError("ยังไม่เปิดรับชำระเงิน กรุณาติดต่อผู้ดูแล", 503);
    const data = checkoutInput(input);
    const order = await this.orders.create({
      ...data,
      id: this.gateway.newOrderId?.() || this.newId(),
      owner,
      provider: this.gateway.provider,
      fingerprint: this.fingerprint(
        JSON.stringify({ items: data.items, customer: data.customer }),
      ),
    });
    return this.publicOrder(order);
  }
  checkProvider(order) {
    if (order.provider !== this.gateway.provider)
      throw new CatalogError(
        "ช่องทางชำระเงินของคำสั่งซื้อนี้ไม่ได้เปิดใช้งาน กรุณาติดต่อผู้ดูแล",
        409,
      );
  }
  async start(owner, id) {
    let paymentAttemptFresh = false;
    if (this.gateway.requiresStartMarker) {
      // Persist before remote I/O so uncertain requests cannot accidentally release stock.
      await this.orders.mutate(id, owner, async (order) => {
        this.checkProvider(order);
        if (
          order.status !== "pending" ||
          Date.now() >= Date.parse(order.expiresAt)
        )
          return order;
        paymentAttemptFresh = !order.paymentId;
        return { ...order, paymentId: order.paymentId || order.id };
      });
    }
    const result = await this.orders.mutate(id, owner, async (order) => {
      this.checkProvider(order);
      if (order.status !== "pending") return order;
      if (Date.now() >= Date.parse(order.expiresAt))
        return this.applyState(order, await this.gateway.cancel(order));
      const session = await this.gateway.start({
        ...order,
        paymentAttemptFresh,
      });
      return { ...order, paymentId: session.id, checkoutUrl: session.url };
    });
    return this.publicOrder(result);
  }
  applyState(order, state) {
    if (order.status !== "pending") return order;
    if (
      state.status === "paid" &&
      (state.amount !== order.total || state.currency !== order.currency)
    )
      throw new CatalogError("ยอดชำระเงินไม่ตรงกับคำสั่งซื้อ", 409);
    return {
      ...order,
      status: ["paid", "expired", "cancelled", "failed"].includes(state.status)
        ? state.status
        : "pending",
      paymentId: state.id || order.paymentId,
    };
  }
  async refresh(owner, id) {
    const result = await this.orders.mutate(id, owner, async (order) => {
      if (order.status !== "pending") return order;
      this.checkProvider(order);
      const state =
        Date.now() >= Date.parse(order.expiresAt)
          ? await this.gateway.cancel(order)
          : await this.gateway.status(order);
      return this.applyState(order, state);
    });
    return this.publicOrder(result);
  }
  async cancel(owner, id) {
    const result = await this.orders.mutate(id, owner, async (order) => {
      if (order.status !== "pending") return order;
      this.checkProvider(order);
      return this.applyState(order, await this.gateway.cancel(order));
    });
    return this.publicOrder(result);
  }
  async simulate(owner, id, outcome) {
    if (this.gateway.provider !== "demo")
      throw new CatalogError("ไม่พบ API", 404);
    if (!["paid", "failed"].includes(outcome))
      throw new CatalogError("ผลการทดสอบไม่ถูกต้อง");
    const result = await this.orders.mutate(id, owner, async (order) => {
      this.checkProvider(order);
      if (order.status !== "pending") return order;
      if (Date.now() >= Date.parse(order.expiresAt))
        return { ...order, status: "expired" };
      return { ...order, status: outcome, paymentId: "demo_" + order.id };
    });
    return this.publicOrder(result);
  }
  async list(owner) {
    return (await this.orders.list(owner)).map((order) =>
      this.publicOrder(order),
    );
  }
  async get(owner, id) {
    return this.publicOrder(await this.orders.get(id, owner));
  }
  async webhook(raw, signature) {
    const event = this.gateway.verifyWebhook(raw, signature);
    if (
      ![
        "checkout.session.completed",
        "checkout.session.expired",
        "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed",
      ].includes(event.type)
    )
      return;
    const session = event.data.object,
      id = session.metadata?.orderId;
    if (!id) return;
    await this.orders.mutate(id, null, async (order) => {
      this.checkProvider(order);
      if (order.paymentId && order.paymentId !== session.id)
        throw new CatalogError("Payment session ไม่ตรงกับคำสั่งซื้อ", 409);
      // Retrieve authoritative state; never trust a browser redirect or unordered event alone.
      const state = await this.gateway.status({
        ...order,
        paymentId: session.id,
      });
      return this.applyState(order, state);
    });
  }
  async paySolutionsPostback(id, token) {
    if (
      this.gateway.provider !== "paysolutions" ||
      !this.gateway.verifyPostback(id, token)
    )
      throw new CatalogError("Postback ไม่ถูกต้อง", 403);
    await this.refresh(null, id);
  }
  async expirePending() {
    for (const order of await this.orders.pending(this.gateway.provider)) {
      if (
        order.provider !== this.gateway.provider ||
        Date.parse(order.expiresAt) > Date.now()
      )
        continue;
      try {
        await this.refresh(null, order.id);
      } catch {
        /* Keep reserved when provider cannot confirm expiry; retry next sweep. */
      }
    }
  }
}

import Stripe from "stripe";
import { PaymentGateway } from "../application/commerce-ports.js";
import { CatalogError } from "../domain/catalog.js";

export class StripePaymentGateway extends PaymentGateway {
  provider = "stripe";
  constructor({
    secretKey = "",
    webhookSecret = "",
    publicUrl = "http://127.0.0.1:3000",
    client,
  } = {}) {
    super();
    this.enabled = !!secretKey && !!webhookSecret;
    this.testMode = !secretKey.startsWith("sk_live_");
    this.label = this.testMode
      ? "บัตรเครดิต / เดบิต · Stripe Test"
      : "บัตรเครดิต / เดบิต · Stripe";
    this.webhookSecret = webhookSecret;
    this.publicUrl = publicUrl.replace(/\/$/, "");
    const url = new URL(this.publicUrl);
    if (!["http:", "https:"].includes(url.protocol))
      throw new Error("PUBLIC_URL must be an HTTP(S) origin");
    if (!this.testMode && url.protocol !== "https:")
      throw new Error("Live Stripe requires an HTTPS PUBLIC_URL");
    this.client =
      client ||
      (secretKey
        ? new Stripe(secretKey, { timeout: 15000, maxNetworkRetries: 1 })
        : null);
  }
  configured() {
    if (!this.enabled || !this.client)
      throw new CatalogError("ยังไม่ได้ตั้งค่า Stripe และ webhook", 503);
  }
  async locate(order) {
    this.configured();
    if (order.paymentId)
      return this.client.checkout.sessions.retrieve(order.paymentId);
    // Recover a remote session if the process stopped after Stripe creation but before DB commit.
    const start = Math.floor(Date.parse(order.createdAt) / 1000) - 5;
    for await (const session of this.client.checkout.sessions.list({
      created: { gte: start, lte: start + 3610 },
      limit: 100,
    })) {
      if (session.metadata?.orderId === order.id) return session;
    }
    return null;
  }
  async start(order) {
    this.configured();
    let session = await this.locate(order);
    if (!session) {
      // Stripe requires expires_at to be at least 30 minutes in the future.
      if (Date.parse(order.expiresAt) - Date.now() < 31 * 60 * 1000)
        throw new CatalogError(
          "หมดเวลาเริ่มชำระเงิน กรุณายกเลิกคำสั่งซื้อนี้แล้วสั่งใหม่",
          409,
        );
      session = await this.client.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: ["card"],
          client_reference_id: order.id,
          metadata: { orderId: order.id },
          customer_email: order.customer.email,
          line_items: order.items.map((item) => ({
            quantity: item.quantity,
            price_data: {
              currency: "thb",
              unit_amount: item.unitAmount,
              product_data: { name: item.name },
            },
          })),
          success_url: `${this.publicUrl}/orders/${order.id}?payment=returned`,
          cancel_url: `${this.publicUrl}/orders/${order.id}?payment=cancelled`,
          expires_at: Math.floor(Date.parse(order.expiresAt) / 1000),
        },
        { idempotencyKey: "checkout_" + order.id },
      );
    }
    return { id: session.id, url: session.url || `/orders/${order.id}` };
  }
  state(session, order) {
    if (!session) return { status: "pending" };
    if (
      session.metadata?.orderId !== order.id ||
      session.client_reference_id !== order.id
    )
      throw new CatalogError("Payment session ไม่ตรงกับคำสั่งซื้อ", 409);
    return {
      id: session.id,
      amount: session.amount_total,
      currency: session.currency,
      status:
        session.status === "expired"
          ? "expired"
          : session.status === "complete" &&
              ["paid", "no_payment_required"].includes(session.payment_status)
            ? "paid"
            : "pending",
    };
  }
  async status(order) {
    return this.state(await this.locate(order), order);
  }
  async cancel(order) {
    let session = await this.locate(order);
    if (!session)
      return {
        status:
          Date.now() >= Date.parse(order.expiresAt) ? "expired" : "cancelled",
      };
    if (session.status === "open") {
      try {
        session = await this.client.checkout.sessions.expire(session.id);
      } catch {
        session = await this.client.checkout.sessions.retrieve(session.id);
      }
    }
    const state = this.state(session, order);
    // Return stock only after the provider confirms it can no longer collect payment.
    if (state.status === "expired" && Date.now() < Date.parse(order.expiresAt))
      state.status = "cancelled";
    return state;
  }
  verifyWebhook(raw, signature) {
    this.configured();
    try {
      return this.client.webhooks.constructEvent(
        raw,
        signature,
        this.webhookSecret,
      );
    } catch {
      throw new CatalogError("ลายเซ็น webhook ไม่ถูกต้อง", 400);
    }
  }
}

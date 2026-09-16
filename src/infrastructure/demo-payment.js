import { PaymentGateway } from "../application/commerce-ports.js";
import { CatalogError } from "../domain/catalog.js";

export class DemoPaymentGateway extends PaymentGateway {
  provider = "demo";
  label = "ชำระเงินจำลอง (ไม่มีการเรียกเก็บเงินจริง)";
  testMode = true;
  enabled = true;
  async start(order) {
    return { id: "demo_" + order.id, url: "/orders/" + order.id };
  }
  async status(order) {
    return {
      status: Date.now() >= Date.parse(order.expiresAt) ? "expired" : "pending",
    };
  }
  async cancel(order) {
    return {
      status:
        Date.now() >= Date.parse(order.expiresAt) ? "expired" : "cancelled",
    };
  }
  verifyWebhook() {
    throw new CatalogError("ไม่พบ API", 404);
  }
}

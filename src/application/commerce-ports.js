/** Orders own price snapshots, inventory reservation, and atomic status changes. */
export class OrderRepository {
  async create(input) {
    throw new Error("Not implemented");
  }
  async get(id, owner) {
    throw new Error("Not implemented");
  }
  async list(owner) {
    throw new Error("Not implemented");
  }
  async mutate(id, owner, work) {
    throw new Error("Not implemented");
  }
}

/** Gateway returns verified payment state; the browser cannot set an order as paid. */
export class PaymentGateway {
  async start(order) {
    throw new Error("Not implemented");
  }
  async status(order) {
    throw new Error("Not implemented");
  }
  async cancel(order) {
    throw new Error("Not implemented");
  }
  verifyWebhook(rawBody, signature) {
    throw new Error("Not implemented");
  }
}

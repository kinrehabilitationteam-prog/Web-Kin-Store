import { randomUUID, createHash } from "node:crypto";
import { createRepository } from "./infrastructure/repository.js";
import { MeilisearchIndex } from "./infrastructure/meilisearch.js";
import { seed } from "./infrastructure/seed.js";
import { CatalogService } from "./application/catalog-service.js";
import { createHttpServer } from "./presentation/http-server.js";
import { SqlOrderRepository } from "./infrastructure/order-repository.js";
import { DemoPaymentGateway } from "./infrastructure/demo-payment.js";
import { StripePaymentGateway } from "./infrastructure/stripe-payment.js";
import { PaySolutionsPaymentGateway } from "./infrastructure/paysolutions-payment.js";
import { CommerceService } from "./application/commerce-service.js";
const repository = await createRepository({
  databaseUrl: process.env.DATABASE_URL,
});
await seed(repository);
const search = process.env.MEILISEARCH_URL
  ? new MeilisearchIndex(
      process.env.MEILISEARCH_URL,
      process.env.MEILISEARCH_KEY,
    )
  : null;
const service = new CatalogService(repository, search, randomUUID);
await service.reindex();
const orders = new SqlOrderRepository(repository);
await orders.initialize();
const paymentProvider = process.env.PAYMENT_PROVIDER || "demo";
if (!["demo", "stripe", "paysolutions"].includes(paymentProvider))
  throw new Error("PAYMENT_PROVIDER must be demo, stripe or paysolutions");
if (process.env.NODE_ENV === "production" && paymentProvider === "demo")
  throw new Error("Demo payment is disabled in production. Configure Stripe.");
const gateway =
  paymentProvider === "paysolutions"
    ? new PaySolutionsPaymentGateway({
        merchantId: process.env.PAYSOLUTIONS_MERCHANT_ID,
        shopName: process.env.PAYSOLUTIONS_SHOP_NAME,
        apiKey: process.env.PAYSOLUTIONS_API_KEY,
        secretKey: process.env.PAYSOLUTIONS_SECRET_KEY,
        publicUrl: process.env.PUBLIC_URL,
      })
    : paymentProvider === "stripe"
      ? new StripePaymentGateway({
          secretKey: process.env.STRIPE_SECRET_KEY,
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
          publicUrl: process.env.PUBLIC_URL || "http://127.0.0.1:3000",
        })
      : new DemoPaymentGateway();
const commerce = new CommerceService({
  catalog: repository,
  orders,
  gateway,
  newId: randomUUID,
  fingerprint: (value) => createHash("sha256").update(value).digest("hex"),
});
let sweepRunning = false;
const sweep = async () => {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    await commerce.expirePending();
  } catch (error) {
    console.warn("Order expiry sweep failed:", error.message);
  } finally {
    sweepRunning = false;
  }
};
const sweepTimer = setInterval(sweep, 60000);
sweepTimer.unref();
await sweep();
const server = createHttpServer(service, {
  adminPassword: process.env.ADMIN_PASSWORD,
  secureCookie: process.env.COOKIE_SECURE === "true",
  commerce,
});
server.listen(
  Number(process.env.PORT) || 3000,
  process.env.HOST || "127.0.0.1",
  () => {
    console.log(
      `BAAN Catalog: http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3000}`,
    );
    console.log(
      `Payment: ${gateway.label}${gateway.enabled ? "" : " (not configured)"}`,
    );
    console.log(
      `Database: ${process.env.DATABASE_URL ? "PostgreSQL" : "SQLite"} | Search: ${search ? "Meilisearch with database fallback" : "Database"}`,
    );
    if (!process.env.ADMIN_PASSWORD)
      console.log(
        "Admin disabled: set ADMIN_PASSWORD (12+ characters) in .env.",
      );
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      clearInterval(sweepTimer);
      await repository.close();
      process.exit(0);
    }),
  );

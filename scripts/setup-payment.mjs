import { readFile, appendFile } from "node:fs/promises";
let content = "";
try {
  content = await readFile(".env", "utf8");
} catch {}
const defaults = {
  PAYMENT_PROVIDER: "demo",
  PUBLIC_URL: "http://127.0.0.1:3000",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
};
const missing = Object.entries(defaults).filter(
  ([key]) => !new RegExp(`^${key}=`, "m").test(content),
);
if (missing.length)
  await appendFile(
    ".env",
    "\n# Cart and payment\n" +
      missing.map(([key, value]) => `${key}=${value}`).join("\n") +
      "\n",
  );
console.log("Payment settings prepared; existing values preserved.");

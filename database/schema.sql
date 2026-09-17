-- PostgreSQL / Neon schema matching the current repository adapters.
-- JSON snapshots and timestamps remain TEXT because the adapters use JSON.parse
-- and ISO strings. Order amounts are integer satang; product prices are baht.
CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  "categoryId" TEXT NOT NULL REFERENCES categories(id),
  price REAL NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL CHECK (stock >= 0),
  image TEXT NOT NULL,
  featured INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_metadata (
  "productId" TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  details TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  customer TEXT NOT NULL,
  items TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  shipping INTEGER NOT NULL,
  total INTEGER NOT NULL,
  currency TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  "paymentId" TEXT,
  "checkoutUrl" TEXT,
  "createdAt" TEXT NOT NULL,
  "expiresAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  UNIQUE (owner, "requestKey")
);

CREATE TABLE IF NOT EXISTS order_reservations (
  "orderId" TEXT NOT NULL REFERENCES orders(id),
  "productId" TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY ("orderId", "productId")
);

CREATE INDEX IF NOT EXISTS orders_owner_created ON orders(owner, "createdAt");

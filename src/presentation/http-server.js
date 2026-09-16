import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { resolve, extname, sep } from "node:path";
import { CatalogError } from "../domain/catalog.js";
import { commerceHttp } from "./commerce-http.js";
export function createHttpServer(
  service,
  {
    adminPassword = "",
    publicDir = resolve("public"),
    secureCookie = false,
    commerce = null,
  } = {},
) {
  const handleCommerce = commerce
    ? commerceHttp(commerce, { secureCookie })
    : null;
  const sessions = new Map(),
    attempts = new Map();
  const hash = (value) => createHash("sha256").update(value).digest();
  const json = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  async function body(req) {
    const raw = await rawBody(req);
    const text = raw.toString("utf8");
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw Error();
      return value;
    } catch {
      throw new CatalogError("ข้อมูล JSON ไม่ถูกต้อง");
    }
  }
  async function rawBody(req) {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 65536) throw new CatalogError("ข้อมูลมีขนาดใหญ่เกินไป", 413);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  return createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' https:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    try {
      const url = new URL(req.url, "http://localhost"),
        path = url.pathname,
        method = req.method;
      const now = Date.now();
      for (const [key, expiry] of sessions)
        if (expiry < now) sessions.delete(key);
      for (const [key, value] of attempts)
        if (value.until < now) attempts.delete(key);
      const token = req.headers.cookie
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("catalog_session="))
        ?.slice(16);
      const authenticated = !!token && sessions.has(token);
      if (path.startsWith("/api/")) {
        if (
          path === "/api/payments/stripe/webhook" &&
          method === "POST" &&
          commerce
        ) {
          await commerce.webhook(
            await rawBody(req),
            req.headers["stripe-signature"],
          );
          return json(res, 200, { received: true });
        }
        if (!["GET", "HEAD"].includes(method)) {
          if (req.headers["sec-fetch-site"] === "cross-site")
            throw new CatalogError("คำขอข้ามเว็บไซต์ไม่ได้รับอนุญาต", 403);
          if (
            req.headers.origin &&
            new URL(req.headers.origin).host !== req.headers.host
          )
            throw new CatalogError("Origin ไม่ถูกต้อง", 403);
          if (!req.headers["content-type"]?.startsWith("application/json"))
            throw new CatalogError("ต้องส่งข้อมูลแบบ JSON", 415);
        }
        if (path === "/api/session" && method === "GET")
          return json(res, 200, {
            authenticated,
            configured: adminPassword.length >= 12,
          });
        if (path === "/api/session" && method === "POST") {
          if (adminPassword.length < 12)
            throw new CatalogError(
              "ตั้งค่า ADMIN_PASSWORD อย่างน้อย 12 ตัวอักษรในไฟล์ .env แล้วเริ่มเซิร์ฟเวอร์ใหม่",
              503,
            );
          const key = req.socket.remoteAddress,
            count = attempts.get(key) || { count: 0, until: now + 600000 };
          if (count.count >= 10)
            throw new CatalogError("ลองเข้าสู่ระบบอีกครั้งใน 10 นาที", 429);
          const input = await body(req);
          if (
            typeof input.password !== "string" ||
            !timingSafeEqual(hash(input.password), hash(adminPassword))
          ) {
            count.count++;
            attempts.set(key, count);
            throw new CatalogError("รหัสผ่านไม่ถูกต้อง", 401);
          }
          attempts.delete(key);
          const session = randomBytes(32).toString("hex");
          sessions.set(session, now + 8 * 3600000);
          res.setHeader(
            "Set-Cookie",
            `catalog_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureCookie ? "; Secure" : ""}`,
          );
          return json(res, 200, { authenticated: true });
        }
        if (path === "/api/session" && method === "DELETE") {
          sessions.delete(token);
          res.setHeader(
            "Set-Cookie",
            "catalog_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          );
          return json(res, 200, { authenticated: false });
        }
        if (
          handleCommerce &&
          (await handleCommerce({
            req,
            res,
            path,
            method,
            authenticated,
            body,
            json,
          }))
        )
          return;
        if (method !== "GET" && !authenticated)
          throw new CatalogError("กรุณาเข้าสู่ระบบผู้ดูแล", 401);
        const match = path.match(
          /^\/api\/(products|categories)(?:\/([^/]+))?$/,
        );
        if (!match) throw new CatalogError("ไม่พบ API", 404);
        const [, resource, id] = match;
        if (method === "GET" && resource === "products")
          return json(
            res,
            200,
            id
              ? await service.product(id)
              : await service.products(Object.fromEntries(url.searchParams)),
          );
        if (method === "GET" && resource === "categories" && !id)
          return json(res, 200, await service.categories());
        if ((method === "POST" && !id) || (method === "PUT" && id))
          return json(
            res,
            method === "POST" ? 201 : 200,
            resource === "products"
              ? await service.saveProduct(await body(req), id)
              : await service.saveCategory(await body(req), id),
          );
        if (method === "DELETE" && id) {
          await (resource === "products"
            ? service.deleteProduct(id)
            : service.deleteCategory(id));
          return json(res, 200, { success: true });
        }
        throw new CatalogError("ไม่รองรับคำขอนี้", 405);
      }
      if (method !== "GET" && method !== "HEAD")
        throw new CatalogError("ไม่รองรับคำขอนี้", 405);
      const requested = decodeURIComponent(path),
        file = resolve(publicDir, "." + requested);
      if (!file.startsWith(publicDir + sep) && file !== publicDir)
        throw new CatalogError("ไม่อนุญาต", 403);
      const extension = extname(file);
      const adminPage =
        /^\/admin(?:\/|$)/.test(requested) &&
        (!extension || extension === ".html");
      if (adminPage && requested !== "/admin/login" && !authenticated) {
        res.writeHead(302, {
          Location: "/admin/login?next=" + encodeURIComponent(requested),
          "Cache-Control": "no-store",
        });
        res.end();
        return;
      }
      if (requested === "/admin/login" && authenticated) {
        res.writeHead(302, { Location: "/admin", "Cache-Control": "no-store" });
        res.end();
        return;
      }
      let content;
      try {
        content = await readFile(
          adminPage
            ? resolve(publicDir, "admin/index.html")
            : extension
              ? file
              : resolve(publicDir, "storefront/index.html"),
        );
      } catch {
        throw new CatalogError("ไม่พบไฟล์", 404);
      }
      res.writeHead(200, {
        "Content-Type":
          ({
            ".css": "text/css",
            ".js": "text/javascript",
            ".svg": "image/svg+xml",
            ".webp": "image/webp",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".html": "text/html",
          }[extension] || "text/html") + "; charset=utf-8",
        "Cache-Control": adminPage ? "no-store" : "no-cache",
      });
      res.end(method === "HEAD" ? undefined : content);
    } catch (error) {
      if (!error.status) console.error(error);
      json(res, error.status || 500, {
        error: error.status ? error.message : "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง",
      });
    }
  });
}

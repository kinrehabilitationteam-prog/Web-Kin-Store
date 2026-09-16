import { randomBytes, createHash } from "node:crypto";
import { CatalogError } from "../domain/catalog.js";

export function commerceHttp(commerce, { secureCookie = false } = {}) {
  return async ({ req, res, path, method, authenticated, body, json }) => {
    if (!path.startsWith("/api/commerce/")) return false;
    let token = req.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("catalog_guest="))
      ?.slice(14);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      token = randomBytes(32).toString("hex");
      res.setHeader(
        "Set-Cookie",
        `catalog_guest=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secureCookie ? "; Secure" : ""}`,
      );
    }
    const owner = createHash("sha256").update(token).digest("hex");
    const send = (status, result) => {
      json(res, status, result);
      return true;
    };
    if (path === "/api/commerce/config" && method === "GET")
      return send(200, commerce.config());
    if (path === "/api/commerce/quote" && method === "POST")
      return send(200, await commerce.quote((await body(req)).items));
    if (path === "/api/commerce/orders" && method === "POST")
      return send(201, await commerce.checkout(owner, await body(req)));
    if (path === "/api/commerce/orders" && method === "GET")
      return send(200, await commerce.list(owner));
    if (path === "/api/commerce/admin/orders" && method === "GET") {
      if (!authenticated)
        throw new CatalogError("กรุณาเข้าสู่ระบบผู้ดูแล", 401);
      return send(200, await commerce.list());
    }
    const match = path.match(
      /^\/api\/commerce\/orders\/([a-zA-Z0-9_-]+)(?:\/(pay|refresh|cancel|simulate))?$/,
    );
    if (match) {
      const [, id, action] = match;
      if (!action && method === "GET")
        return send(200, await commerce.get(owner, id));
      if (action && method === "POST") {
        const input = await body(req);
        const result =
          action === "pay"
            ? await commerce.start(owner, id)
            : action === "refresh"
              ? await commerce.refresh(owner, id)
              : action === "cancel"
                ? await commerce.cancel(owner, id)
                : await commerce.simulate(owner, id, input.outcome);
        return send(200, result);
      }
    }
    throw new CatalogError("ไม่พบ API", 404);
  };
}

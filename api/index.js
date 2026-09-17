// Reuse the HTTP handler without binding a port inside Vercel Functions.
let handler;
export default async function vercelHandler(req, res) {
  try {
    handler ||= import("../src/main.js").then(
      ({ server }) => server.listeners("request")[0],
    );
    return await (
      await handler
    )(req, res);
  } catch {
    res.writeHead(503, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(
      JSON.stringify({
        error:
          "Server configuration unavailable. Check DATABASE_URL and PAYMENT_PROVIDER in Vercel Environment Variables.",
      }),
    );
  }
}

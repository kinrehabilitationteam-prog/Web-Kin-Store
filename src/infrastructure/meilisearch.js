import { SearchIndex } from "../application/ports.js";
export class MeilisearchIndex extends SearchIndex {
  constructor(url, key) {
    super();
    this.url = url.replace(/\/$/, "");
    this.key = key;
    this.ready = false;
    this.queue = Promise.resolve();
  }
  async request(path, method = "GET", body) {
    const response = await fetch(this.url + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Meilisearch HTTP ${response.status}`);
    return response.json();
  }
  async wait(task) {
    for (let i = 0; i < 80; i++) {
      const state = await this.request(`/tasks/${task.taskUid}`);
      if (state.status === "succeeded") return;
      if (["failed", "canceled"].includes(state.status))
        throw new Error(state.error?.message || state.status);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Search indexing timed out");
  }
  async search(q) {
    if (!this.ready) throw new Error("Index is not ready");
    const result = await this.request("/indexes/products/search", "POST", {
      q,
      limit: 10000,
      attributesToRetrieve: ["id"],
    });
    return result.hits.map((p) => p.id);
  }
  sync(products) {
    this.ready = false;
    const run = this.queue
      .catch(() => {})
      .then(async () => {
        await this.wait(
          await this.request(
            "/indexes/products/documents?primaryKey=id",
            "POST",
            products,
          ),
        );
        const current = await this.request(
          "/indexes/products/documents?limit=100000&fields=id",
        );
        const ids = new Set(products.map((p) => p.id));
        const removed = current.results
          .filter((p) => !ids.has(p.id))
          .map((p) => p.id);
        if (removed.length)
          await this.wait(
            await this.request(
              "/indexes/products/documents/delete-batch",
              "POST",
              removed,
            ),
          );
        this.ready = true;
      });
    this.queue = run;
    return run;
  }
}

import {
  CatalogError,
  categoryInput,
  productInput,
} from "../domain/catalog.js";
export class CatalogService {
  constructor(repository, search, newId) {
    this.repository = repository;
    this.search = search;
    this.newId = newId;
  }
  categories() {
    return this.repository.listCategories();
  }
  async products({
    q = "",
    category = "",
    sort = "newest",
    page = "1",
    limit = "12",
    available = "",
  } = {}) {
    let products = await this.repository.listProducts();
    if (q.trim()) {
      let ids = null;
      if (this.search) {
        try {
          ids = await this.search.search(q.trim());
        } catch {
          /* Database fallback keeps search available. */
        }
      }
      const terms = q.toLocaleLowerCase().trim().split(/\s+/);
      products = products.filter((p) =>
        ids
          ? ids.includes(p.id)
          : terms.every((t) =>
              `${p.name} ${p.sku} ${p.description} ${p.categoryName}`
                .toLocaleLowerCase()
                .includes(t),
            ),
      );
    }
    if (category) products = products.filter((p) => p.categoryId === category);
    if (available === "true") products = products.filter((p) => p.stock > 0);
    products.sort(
      sort === "price-asc"
        ? (a, b) => a.price - b.price
        : sort === "price-desc"
          ? (a, b) => b.price - a.price
          : sort === "name"
            ? (a, b) => a.name.localeCompare(b.name, "th")
            : (a, b) =>
                b.createdAt.localeCompare(a.createdAt) ||
                a.name.localeCompare(b.name, "th"),
    );
    const size = Math.min(100, Math.max(1, parseInt(limit) || 12));
    const total = products.length,
      pages = Math.max(1, Math.ceil(total / size));
    const current = Math.min(pages, Math.max(1, parseInt(page) || 1));
    return {
      items: products.slice((current - 1) * size, current * size),
      total,
      page: current,
      pages,
    };
  }
  async product(id) {
    const product = (await this.repository.listProducts()).find(
      (p) => p.id === id,
    );
    if (!product) throw new CatalogError("ไม่พบสินค้า", 404);
    return product;
  }
  async saveProduct(input, id) {
    const data = productInput(input);
    const existing = id ? await this.product(id) : null;
    if (!(await this.categories()).some((c) => c.id === data.categoryId))
      throw new CatalogError("ไม่พบหมวดหมู่ที่เลือก");
    const product = {
      ...data,
      id: id || this.newId(),
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    await this.repository.saveProduct(product);
    await this.reindex();
    return this.product(product.id);
  }
  async deleteProduct(id) {
    await this.product(id);
    await this.repository.deleteProduct(id);
    await this.reindex();
  }
  async saveCategory(input, id) {
    const data = categoryInput(input),
      categories = await this.categories();
    if (id && !categories.some((c) => c.id === id))
      throw new CatalogError("ไม่พบหมวดหมู่", 404);
    if (
      categories.some(
        (c) => c.id !== id && c.name.toLowerCase() === data.name.toLowerCase(),
      )
    )
      throw new CatalogError("ชื่อหมวดหมู่ซ้ำ", 409);
    const category = { ...data, id: id || this.newId() };
    await this.repository.saveCategory(category);
    await this.reindex();
    return category;
  }
  async deleteCategory(id) {
    if (!(await this.categories()).some((c) => c.id === id))
      throw new CatalogError("ไม่พบหมวดหมู่", 404);
    if ((await this.repository.listProducts()).some((p) => p.categoryId === id))
      throw new CatalogError("กรุณาย้ายหรือลบสินค้าในหมวดหมู่นี้ก่อน", 409);
    await this.repository.deleteCategory(id);
  }
  async reindex() {
    if (!this.search) return;
    try {
      await this.search.sync(await this.repository.listProducts());
    } catch (error) {
      console.warn(
        "Search index unavailable; using database search:",
        error.message,
      );
    }
  }
}

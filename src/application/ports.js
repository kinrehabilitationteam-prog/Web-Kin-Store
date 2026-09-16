/** Repository port. Implementations belong to Infrastructure, never Domain. */
export class CatalogRepository {
  async listProducts() {
    throw new Error("Not implemented");
  }
  async listCategories() {
    throw new Error("Not implemented");
  }
  async saveProduct(product) {
    throw new Error("Not implemented");
  }
  async deleteProduct(id) {
    throw new Error("Not implemented");
  }
  async saveCategory(category) {
    throw new Error("Not implemented");
  }
  async deleteCategory(id) {
    throw new Error("Not implemented");
  }
}
export class SearchIndex {
  async search(query) {
    throw new Error("Not implemented");
  }
  async sync(products) {
    throw new Error("Not implemented");
  }
}

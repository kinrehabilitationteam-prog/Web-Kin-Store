import { kinProducts, kinCategories } from "./kin-catalog.js";
export async function seed(repository) {
  if ((await repository.listCategories()).length) return;
  for (const category of kinCategories) await repository.saveCategory(category);
  for (const product of kinProducts) {
    await repository.saveProduct(product);
    await repository.query(
      'INSERT INTO product_metadata ("productId",details) VALUES ($1,$2)',
      [product.id, JSON.stringify(product.catalog)],
    );
  }
}

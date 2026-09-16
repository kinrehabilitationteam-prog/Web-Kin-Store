import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import {
  createRepository,
  SqlCatalogRepository,
} from "../src/infrastructure/repository.js";
import {
  kinProducts,
  kinCategories,
  sourceUrl,
  importedAt,
} from "../src/infrastructure/kin-catalog.js";
import { MeilisearchIndex } from "../src/infrastructure/meilisearch.js";
const db = await createRepository({ databaseUrl: process.env.DATABASE_URL });
const oldIds = [
  "vase",
  "lamp",
  "chair",
  "bowl",
  "vase-green",
  "stool",
  "pendant",
  "cup",
  "ae9d9dbb-9a4c-4f1b-afe8-7669480cc024",
];
try {
  for (const product of kinProducts) await access("public" + product.image);
  await mkdir("data/backups", { recursive: true });
  const backup = "data/backups/catalog-before-kin-" + Date.now() + ".json";
  const provenance = JSON.parse(
    await readFile("data/kin-image-provenance.json", "utf8"),
  );
  await db.transaction(async (query) => {
    const products = await query("SELECT * FROM products"),
      categories = await query("SELECT * FROM categories");
    const reservations = await query(
      'SELECT "productId" FROM order_reservations',
    );
    if (reservations.some((r) => oldIds.includes(r.productId)))
      throw Error(
        "A sample product has an active order reservation; import aborted.",
      );
    await writeFile(
      backup,
      JSON.stringify({ products, categories, sourceUrl, importedAt }, null, 2),
    );
    const target = new SqlCatalogRepository(query, () => {});
    for (const category of kinCategories) await target.saveCategory(category);
    for (const product of kinProducts) {
      await target.saveProduct(product);
      const catalog = {
        ...product.catalog,
        imageSourceUrl: provenance.find((p) => p.id === product.id).source,
      };
      await query(
        'INSERT INTO product_metadata ("productId",details) VALUES ($1,$2) ON CONFLICT("productId") DO UPDATE SET details=excluded.details',
        [product.id, JSON.stringify(catalog)],
      );
    }
    for (const id of oldIds)
      await query("DELETE FROM products WHERE id=$1", [id]);
    for (const id of ["living", "lighting", "furniture", "dining"])
      await query(
        'DELETE FROM categories WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM products WHERE "categoryId"=$2)',
        [id, id],
      );
  });
  if (process.env.MEILISEARCH_URL)
    await new MeilisearchIndex(
      process.env.MEILISEARCH_URL,
      process.env.MEILISEARCH_KEY,
    ).sync(await db.listProducts());
  console.log(
    JSON.stringify(
      {
        imported: kinProducts.length,
        total: (await db.listProducts()).length,
        categories: (await db.listCategories()).length,
        backup,
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}

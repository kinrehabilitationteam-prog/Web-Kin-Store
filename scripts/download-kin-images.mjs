import { readFile, writeFile, mkdir } from "node:fs/promises";
import { kinProducts } from "../src/infrastructure/kin-catalog.js";
const images = JSON.parse(await readFile("data/kin-images.json", "utf8"));
await mkdir("public/assets/kin", { recursive: true });
for (const product of kinProducts) {
  const source = images[product.catalog.imageIndex];
  const response = await fetch(source.url, {
    signal: AbortSignal.timeout(30000),
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("image/")
  )
    throw Error("Image download failed: " + product.id);
  await writeFile(
    "public" + product.image,
    Buffer.from(await response.arrayBuffer()),
  );
  product.catalog.imageSourceUrl = source.url;
  console.log("Downloaded " + product.id);
}
await writeFile(
  "data/kin-image-provenance.json",
  JSON.stringify(
    kinProducts.map((p) => ({
      id: p.id,
      image: p.image,
      source: p.catalog.imageSourceUrl,
    })),
    null,
    2,
  ),
);

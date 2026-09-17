import { createHash } from "node:crypto";
import { CatalogError } from "../domain/catalog.js";

export function imageInput(input) {
  const match =
    typeof input.data === "string" &&
    input.data.match(
      /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/,
    );
  if (!match) throw new CatalogError("รองรับเฉพาะภาพ JPG, PNG และ WebP");
  const [, type, data] = match;
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.length > 2 * 1024 * 1024)
    throw new CatalogError("รูปภาพต้องมีขนาดไม่เกิน 2 MB", 413);
  const valid =
    type === "image/png"
      ? bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
      : type === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid || bytes.toString("base64") !== data)
    throw new CatalogError("ไฟล์รูปภาพไม่ถูกต้อง");
  return { id: createHash("sha256").update(bytes).digest("hex"), type, data };
}

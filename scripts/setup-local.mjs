import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
let content = "";
try {
  content = await readFile(".env", "utf8");
} catch {}
if (!/^ADMIN_PASSWORD=.+$/m.test(content)) {
  const password = randomBytes(18).toString("base64url");
  content = content.replace(/^ADMIN_PASSWORD=.*\r?\n?/m, "");
  await writeFile(".env", content + `\nADMIN_PASSWORD=${password}\n`);
  console.log("Created a random local admin password in .env.");
} else console.log("Existing admin password preserved.");

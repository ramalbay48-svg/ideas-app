import { mkdir, copyFile, access } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const web = join(root, "www");
const management = join(web, "management");
await mkdir(management, { recursive: true });

for (const file of ["index.html", "styles.css", "app.js"]) {
  await access(join(root, file));
  await copyFile(join(root, file), join(web, file));
}
for (const file of ["index.html", "portal.css", "portal.js"]) {
  await access(join(root, "management", file));
  await copyFile(join(root, "management", file), join(management, file));
}
console.log("IDEAS APP customer and management screens prepared for Android.");

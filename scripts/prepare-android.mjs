import { mkdir, copyFile, access, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const variant = (process.env.APP_VARIANT || "customer").toLowerCase();
if (!["customer", "management"].includes(variant)) {
  throw new Error("APP_VARIANT must be customer or management");
}

const web = join(root, "www");
await mkdir(web, { recursive: true });

if (variant === "customer") {
  for (const file of ["index.html", "styles.css", "app.js"]) {
    await access(join(root, file));
    await copyFile(join(root, file), join(web, file));
  }
  await writeFile(join(root, "capacitor.config.json"), JSON.stringify({
    appId: "com.ideasapp.marketplace",
    appName: "IDEAS APP",
    webDir: "www",
    bundledWebRuntime: false,
    android: { allowMixedContent: false }
  }, null, 2));
} else {
  for (const file of ["index.html", "portal.css", "portal.js"]) {
    await access(join(root, "management", file));
    await copyFile(join(root, "management", file), join(web, file));
  }
  await writeFile(join(root, "capacitor.config.json"), JSON.stringify({
    appId: "com.ideasapp.management",
    appName: "IDEAS APP Management",
    webDir: "www",
    bundledWebRuntime: false,
    android: { allowMixedContent: false }
  }, null, 2));
}
console.log(`Prepared IDEAS APP ${variant} Android app.`);

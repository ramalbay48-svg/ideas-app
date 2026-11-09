import { mkdir, copyFile, access, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const variant = (process.env.APP_VARIANT || "customer").toLowerCase();
if (!["customer", "management", "tipster"].includes(variant)) {
  throw new Error("APP_VARIANT must be customer, management or tipster");
}
const web = join(root, "www");
await mkdir(web, { recursive: true });

const configs = {
  customer: {
    files: [["index.html","index.html"],["styles.css","styles.css"],["app.js","app.js"]],
    appId: "com.ideasapp.marketplace",
    appName: "IDEAS APP"
  },
  management: {
    files: [["management/index.html","index.html"],["management/portal.css","portal.css"],["management/portal.js","portal.js"]],
    appId: "com.ideasapp.management",
    appName: "IDEAS APP Management"
  },
  tipster: {
    files: [["tipster/index.html","index.html"],["tipster/tipster.css","tipster.css"],["tipster/tipster.js","tipster.js"]],
    appId: "com.ideasapp.tipster",
    appName: "IDEAS APP Tipster"
  }
};
const config = configs[variant];
for (const [source,destination] of config.files) {
  await access(join(root,source));
  await copyFile(join(root,source),join(web,destination));
}
await writeFile(join(root,"capacitor.config.json"),JSON.stringify({
  appId:config.appId,
  appName:config.appName,
  webDir:"www",
  bundledWebRuntime:false,
  android:{allowMixedContent:false}
},null,2));
console.log(`Prepared IDEAS APP ${variant} Android app.`);

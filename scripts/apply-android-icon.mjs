import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const res = join(process.cwd(), "android", "app", "src", "main", "res");
const foreground = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M29,25 L79,25 L79,37 L63,37 L63,78 L79,78 L79,90 L29,90 L29,78 L45,78 L45,37 L29,37 Z" />
    <path
        android:fillColor="#FF39D98A"
        android:pathData="M59,84 C69,78 78,70 84,59 C82,72 74,84 62,91 Z" />
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M61,83 C69,78 75,72 80,64 C77,74 70,82 62,87 Z" />
</vector>
`;
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ideas_icon_background" />
    <foreground android:drawable="@drawable/ideas_launcher_foreground" />
</adaptive-icon>
`;
await mkdir(join(res, "drawable"), { recursive: true });
await mkdir(join(res, "mipmap-anydpi-v26"), { recursive: true });
await mkdir(join(res, "values"), { recursive: true });
await writeFile(join(res, "drawable", "ideas_launcher_foreground.xml"), foreground);
await writeFile(join(res, "mipmap-anydpi-v26", "ic_launcher.xml"), adaptive);
await writeFile(join(res, "mipmap-anydpi-v26", "ic_launcher_round.xml"), adaptive);
await writeFile(join(res, "values", "ideas_icon_colors.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ideas_icon_background">#008F42</color>
</resources>
`);
console.log("Applied the official IDEAS APP adaptive launcher icon.");

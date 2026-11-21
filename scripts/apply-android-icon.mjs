import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const res = join(process.cwd(), "android", "app", "src", "main", "res");
const foreground = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#FFFFFFFF"
        android:pathData="M30,24 H78 V34 H62 V74 H78 V84 H30 V74 H46 V34 H30 Z" />
</vector>
`;
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ideas_launcher_background" />
    <foreground android:drawable="@drawable/ideas_launcher_foreground" />
</adaptive-icon>
`;
const background = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <corners android:radius="28dp" />
    <gradient android:angle="90" android:startColor="#62E85A" android:centerColor="#08B94B" android:endColor="#00643B" />
    <stroke android:width="2dp" android:color="#8AFFAD" />
</shape>
`;
await mkdir(join(res, "drawable"), { recursive: true });
await mkdir(join(res, "mipmap-anydpi-v26"), { recursive: true });
await writeFile(join(res, "drawable", "ideas_launcher_foreground.xml"), foreground);
await writeFile(join(res, "drawable", "ideas_launcher_background.xml"), background);
await writeFile(join(res, "mipmap-anydpi-v26", "ic_launcher.xml"), adaptive);
await writeFile(join(res, "mipmap-anydpi-v26", "ic_launcher_round.xml"), adaptive);
console.log("Applied the official IDEAS APP white-I green-gradient launcher icon.");

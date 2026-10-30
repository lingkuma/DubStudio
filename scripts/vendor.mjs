import fs from "node:fs/promises";
import path from "node:path";
const dest = "public/vendor/soundtouch";
await fs.mkdir(dest, { recursive: true });
for (const name of ["soundtouch.js", "soundtouch.js.map"])
  await fs.copyFile(
    path.join("node_modules/soundtouchjs/dist", name),
    path.join(dest, name),
  );
await fs.copyFile(
  "node_modules/soundtouchjs/LICENSE",
  path.join(dest, "LICENSE.txt"),
);
const map = JSON.parse(
  await fs.readFile("node_modules/soundtouchjs/dist/soundtouch.js.map", "utf8"),
);
for (let i = 0; i < map.sources.length; i++) {
  const name = map.sources[i].replace(/^\.\.\//, "");
  if (name.includes("..") || !name.endsWith(".js")) continue;
  const file = path.join(dest, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, map.sourcesContent[i]);
}
await fs.mkdir("public/licenses", { recursive: true });
for (const name of [
  "@webav/av-cliper",
  "@webav/av-canvas",
  "@xzdarcy/react-timeline-editor",
  "react",
  "react-dom",
  "zustand",
  "idb-keyval",
  "fflate",
  "lucide-react",
]) {
  for (const candidate of [
    "LICENSE",
    "LICENSE.txt",
    "LICENSE.md",
    "LICENCE",
    "LICENCE.txt",
  ]) {
    try {
      await fs.copyFile(
        path.join("node_modules", name, candidate),
        path.join(
          "public/licenses",
          name.replaceAll("/", "-").replace("@", "") + ".txt",
        ),
      );
      break;
    } catch {}
  }
}
console.log("Vendor audio module, original source and licenses copied.");

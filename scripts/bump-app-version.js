import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "app-version.json");
let data = { build: 0, at: "" };
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  /* first run */
}
data.build = (Number(data.build) || 0) + 1;
data.at = new Date().toISOString();
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");

const htmlFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.html");
if (fs.existsSync(htmlFile)) {
  let html = fs.readFileSync(htmlFile, "utf8");
  html = html.replace(/<meta name="app-build" content="\d+">/, `<meta name="app-build" content="${data.build}">`);
  fs.writeFileSync(htmlFile, html);
}

console.log("App build:", data.build);

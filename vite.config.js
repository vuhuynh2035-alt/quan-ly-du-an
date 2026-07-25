import { defineConfig } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));
const versionFile = path.join(root, "public", "app-version.json");

function readAppBuild() {
  try {
    const data = JSON.parse(fs.readFileSync(versionFile, "utf8"));
    return Number(data.build) || 0;
  } catch {
    return 0;
  }
}

export default defineConfig({
  root: ".",
  publicDir: "public",
  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },
  build: {
    rollupOptions: {
      input: "index.html",
    },
  },
  plugins: [
    {
      name: "inject-app-build",
      transformIndexHtml(html) {
        const build = String(readAppBuild());
        return html
          .replace(/(<meta name="app-build" content=")[^"]*(")/i, `$1${build}$2`)
          .replace(/__APP_BUILD__/g, build);
      },
    },
  ],
});

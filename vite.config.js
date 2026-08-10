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
    target: "es2020",
    cssCodeSplit: true,
    // Tránh preload Firebase sớm — ưu tiên tải app.js để first paint từ cache.
    modulePreload: false,
    rollupOptions: {
      input: "index.html",
      output: {
        manualChunks: function (id) {
          if (id.includes("node_modules/firebase/messaging") || id.includes("firebase/messaging"))
            return "fb-messaging";
          if (id.includes("node_modules/firebase/storage") || id.includes("firebase/storage"))
            return "fb-storage";
          if (id.includes("node_modules/firebase/functions") || id.includes("firebase/functions"))
            return "fb-functions";
          if (id.includes("node_modules/firebase") || id.includes("@firebase"))
            return "firebase";
          if (id.includes("biometric-auth")) return "biometric";
        },
      },
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
    {
      // app.js là classic script (vẽ UI từ cache trước khi tải Firebase module).
      name: "copy-app-js",
      async writeBundle(options) {
        const outDir = options.dir || path.join(root, "dist");
        const destDir = path.join(outDir, "js");
        fs.mkdirSync(destDir, { recursive: true });
        const src = path.join(root, "js", "app.js");
        const dest = path.join(destDir, "app.js");
        try {
          const esbuild = await import("esbuild");
          await esbuild.build({
            entryPoints: [src],
            outfile: dest,
            minify: true,
            target: ["es2018"],
            legalComments: "none",
          });
        } catch {
          fs.copyFileSync(src, dest);
        }
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.split("?")[0] === "/js/app.js") {
            res.setHeader("Content-Type", "application/javascript; charset=utf-8");
            fs.createReadStream(path.join(root, "js", "app.js")).pipe(res);
            return;
          }
          next();
        });
      },
    },
  ],
});

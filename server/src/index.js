import "dotenv/config";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { initDb } from "./db.js";
import { createRouter } from "./routes.js";
import { attachWebSocket } from "./ws.js";

var PORT = Number(process.env.PORT || 3000);
var DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
var WEB_APP_ORIGIN = process.env.WEB_APP_ORIGIN || true;

initDb(DATA_DIR);

var app = express();
app.set("trust proxy", 1);
app.use(
  cors({
    origin: WEB_APP_ORIGIN === "true" || WEB_APP_ORIGIN === true ? true : WEB_APP_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

app.use("/uploads", express.static(path.join(DATA_DIR, "uploads")));
app.use("/api", createRouter());

var publicDir = process.env.STATIC_DIR || path.resolve(process.cwd(), "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/^(?!\/api\/|\/ws(?:\?|$)|\/uploads\/).*/, function (req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    var index = path.join(publicDir, "index.html");
    if (fs.existsSync(index)) return res.sendFile(index);
    next();
  });
}

var server = http.createServer(app);
attachWebSocket(server);

server.listen(PORT, function () {
  console.log("[selfhost] listening on :" + PORT);
  console.log("[selfhost] data dir: " + DATA_DIR);
  console.log("[selfhost] health: GET /api/health");
  console.log("[selfhost] ws: /ws");
});

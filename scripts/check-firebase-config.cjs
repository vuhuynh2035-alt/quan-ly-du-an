#!/usr/bin/env node
/** Fail package/build for static deploy if public/firebase-config.js missing or still example. */
var fs = require("fs");
var path = require("path");
var root = path.resolve(__dirname, "..");
var cfgPath = path.join(root, "public", "firebase-config.js");
if (!fs.existsSync(cfgPath)) {
  console.error("THIEU public/firebase-config.js");
  console.error("Copy tu may co Firebase: public\\firebase-config.js (khong co trong Git).");
  console.error("Hoac: copy public\\firebase-config.example.js -> firebase-config.js roi dien gia tri that.");
  process.exit(1);
}
var txt = fs.readFileSync(cfgPath, "utf8");
if (/YOUR_API_KEY|YOUR_PROJECT_ID/.test(txt)) {
  console.error("public/firebase-config.js van con gia tri mau — dien cau hinh Firebase that truoc khi dong goi.");
  process.exit(1);
}
console.log("OK public/firebase-config.js");

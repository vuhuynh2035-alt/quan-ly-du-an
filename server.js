/**
 * Web Server Cục bộ cho Ứng dụng Quản Lý Dự Án SAREE
 * Chạy trên máy chủ riêng (HPG2Z4 / HP Machine) phục vụ máy tính và điện thoại nội bộ.
 */

import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8084;
const DIST_DIR = path.join(__dirname, 'dist');

// Kiểm tra xem dist đã được build chưa
if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.log('⚠️ Thư mục dist chưa được biên dịch. Vui lòng chạy "npm run build" trước.');
}

// Thiết lập header kiểm soát bộ nhớ đệm (Cache-Control) chuẩn PWA
app.use((req, res, next) => {
  const url = req.path;

  // Các file cấu hình & phiên bản không lưu đệm để client luôn nhận bản mới tức thì
  if (
    url === '/firebase-messaging-sw.js' ||
    url === '/manifest.json' ||
    url === '/app-version.json' ||
    url === '/firebase-config.js'
  ) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (url === '/' || url === '/index.html') {
    res.set('Cache-Control', 'no-cache, must-revalidate');
  } else if (url.startsWith('/assets/')) {
    // Tài nguyên tĩnh có mã băm (hash) được cache lâu dài
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (url.match(/\.(css|js|png|jpg|jpeg|svg|ico|wav|woff2?)$/)) {
    res.set('Cache-Control', 'public, max-age=86400');
  }
  next();
});

// Phục vụ toàn bộ tệp tĩnh từ thư mục dist
app.use(
  express.static(DIST_DIR, {
    index: 'index.html',
    dotfiles: 'ignore',
  })
);

// Fallback: mọi đường dẫn SPA chuyển hướng về index.html
app.use((req, res) => {
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Vui lòng chạy "npm run build" để khởi tạo ứng dụng.');
  }
});

// Lấy danh sách địa chỉ IP nội bộ của máy chủ HP
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Chỉ lấy IPv4 và bỏ qua loopback (127.0.0.1)
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();

  console.clear();
  console.log('================================================================');
  console.log('       QUẢN LÝ DỰ ÁN SAREE - MÁY CHỦ RIÊNG HP (HPG2Z4)');
  console.log('================================================================\n');
  console.log(`  [OK] Máy chủ đang hoạt động tại cổng: ${PORT}`);
  console.log('  [OK] Phục vụ giao diện điều phối công trình & tiến độ dự án.\n');
  console.log('----------------------------------------------------------------');
  console.log('  ĐƯỜNG LINK TRUY CẬP ỨNG DỤNG:');
  console.log('----------------------------------------------------------------');
  console.log(`  * Mở trên máy tính này (máy HP):`);
  console.log(`    👉 http://localhost:${PORT}`);
  console.log('');
  console.log(`  * Mở trên Điện thoại / Máy tính bảng / Laptop cùng mạng Wi-Fi:`);
  if (ips.length > 0) {
    ips.forEach((ip) => {
      console.log(`    👉 http://${ip}:${PORT}`);
    });
  } else {
    console.log(`    👉 http://<IP_MÁY_HP>:${PORT}`);
  }
  console.log('----------------------------------------------------------------');
  console.log('  * Nhấn Ctrl + C để dừng máy chủ.\n');
  console.log('================================================================');
});

// Xử lý dừng máy chủ an toàn
process.on('SIGINT', () => {
  console.log('\nĐang dừng máy chủ Quản lý dự án...');
  server.close(() => {
    console.log('Đã dừng máy chủ an toàn.');
    process.exit(0);
  });
});

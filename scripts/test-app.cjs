const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Health/family-medical-record/node_modules/playwright');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const PORT = 8099;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(DIST_DIR, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    const indexPath = path.join(DIST_DIR, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(indexPath).pipe(res);
  }
});

server.listen(PORT, async () => {
  console.log(`[Test Server] Đang chạy tại http://localhost:${PORT}`);
  let browser;
  const consoleErrors = [];
  const consoleLogs = [];

  try {
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const execPath = fs.existsSync(edgePath) ? edgePath : chromePath;

    browser = await chromium.launch({ headless: true, executablePath: execPath });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      consoleLogs.push(`[${type}] ${text}`);
      if (type === 'error') {
        consoleErrors.push(text);
      }
    });

    page.on('pageerror', err => {
      consoleErrors.push(`PageError: ${err.message}`);
    });

    console.log('1. Tải ứng dụng...');
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    const title = await page.title();
    console.log('   Tiêu đề trang:', title);

    const hdrTitle = await page.textContent('#hdr-title-text').catch(() => null);
    console.log('   Tiêu đề Header:', hdrTitle);

    const hasApp = await page.$('#app');
    console.log('   Khung #app tồn tại:', !!hasApp);

    const authModal = await page.$('#auth-overlay');
    const isAuthModalVisible = authModal ? await authModal.isVisible() : false;
    console.log('   Màn hình đăng nhập hiển thị an toàn:', isAuthModalVisible);

    // Kiểm tra viewport di động
    console.log('2. Kiểm tra giao diện điện thoại (375x812)...');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(1000);
    const mobileOk = await page.isVisible('#app');
    console.log('   Giao diện di động phản hồi tốt:', mobileOk);

    console.log('\n--- Thống kê Lỗi Console ---');
    console.log(`Tổng số lỗi: ${consoleErrors.length}`);
    consoleErrors.forEach(e => console.log('  ❌ ' + e));

    if (consoleErrors.length === 0) {
      console.log('\n>>> KẾT QUẢ: ỨNG DỤNG HOẠT ĐỘNG HOÀN TOÀN TỐT, KHÔNG CÓ LỖI RUNTIME! <<<\n');
    } else {
      console.log('\n>>> CẢNH BÁO: Phát hiện lỗi runtime cần xử lý! <<<\n');
    }

  } catch (err) {
    console.error('Kiểm thử thất bại:', err);
  } finally {
    if (browser) await browser.close();
    server.close();
    process.exit(0);
  }
});

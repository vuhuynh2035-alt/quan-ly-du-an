# Stage 1: Biên dịch ứng dụng Vite / Quản lý dự án SAREE
FROM node:20-alpine AS builder

WORKDIR /app

# Sao chép file định nghĩa gói
COPY package*.json ./

# Cài đặt gói phụ thuộc
RUN npm install

# Sao chép toàn bộ mã nguồn
COPY . .

# Firebase web config is intentionally excluded from Git.
RUN if [ ! -s public/firebase-config.js ]; then \
      echo "ERROR: Missing public/firebase-config.js; copy the project config to the server."; exit 1; \
    fi; \
    if grep -Eq 'YOUR_API_KEY|YOUR_PROJECT_ID' public/firebase-config.js; then \
      echo "ERROR: Replace the Firebase placeholder values in public/firebase-config.js."; exit 1; \
    fi

# Biên dịch sản phẩm ra thư mục /app/dist
RUN npx vite build

# Stage 2: Phục vụ tệp tĩnh bằng máy chủ web Nginx siêu nhẹ
FROM nginx:alpine

# Sao chép file cấu hình Nginx tối ưu PWA và SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Sao chép tệp đã biên dịch vào thư mục web root của Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# News Portal

Website cổng thông tin tin tức được xây dựng bằng Node.js, Express và MongoDB Atlas, triển khai bằng Docker Compose.

## Công nghệ sử dụng

- **Backend:** Node.js, Express
- **Database:** MongoDB Atlas, Mongoose
- **Web server / Reverse Proxy:** Nginx
- **Container:** Docker, Docker Compose
- **Monitoring:** Prometheus, Grafana, Node Exporter, cAdvisor
- **Logging:** Loki, Promtail

## Yêu cầu

- Docker Engine
- Docker Compose plugin
- Tài khoản MongoDB Atlas đã cấu hình database và quyền truy cập mạng phù hợp

## Cấu hình môi trường

1. Tạo file `.env` từ file mẫu:

   ```bash
   cp .env.example .env
   ```

2. Điền các giá trị thực tế vào `.env`:

   - `PORT`
   - `MONGO_URI`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `JWT_SECRET`
   - `SMTP_EMAIL`
   - `SMTP_APP_PASSWORD`

Không đưa file `.env` chứa thông tin bí mật lên GitHub.

## Chạy hệ thống

Khởi động các dịch vụ:

```bash
docker compose up -d --build
```

Kiểm tra trạng thái:

```bash
docker compose ps
```

Xem log:

```bash
docker compose logs -f
```

Dừng hệ thống:

```bash
docker compose down
```

## Truy cập dịch vụ

| Dịch vụ | Địa chỉ |
|---|---|
| Website | http://localhost:8080 |
| Grafana | http://localhost:3001 |
| Prometheus | Theo cấu hình Docker Compose |
| Loki | Theo cấu hình Docker Compose |

Thông tin đăng nhập Grafana được cấu hình bằng các biến môi trường trong file `.env`.

## Monitoring và Logging

Prometheus thu thập các metrics được cấu hình trong `monitoring/prometheus/prometheus.yml`.

Grafana cung cấp giao diện trực quan hóa metrics và truy vấn log.

Loki lưu trữ log; Promtail thu thập log từ các container Docker và chuyển đến Loki.

Một số truy vấn LogQL tham khảo:

```logql
{container=~".+"}
```

```logql
{container="news-portal-nginx"}
```

```logql
{container="news-portal-app"}
```

## Cấu trúc dự án

```text
.
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env.example
├── nginx/
│   └── default.conf
├── monitoring/
│   ├── prometheus/
│   ├── loki/
│   └── promtail/
├── public/
├── src/
│   ├── app.js
│   ├── config/
│   ├── middleware/
│   └── models/
└── package.json
```

## Bảo mật

- File `.env` được loại trừ khỏi Git.
- Ứng dụng chạy bằng user không phải root trong container.
- Container ứng dụng sử dụng `no-new-privileges`, loại bỏ Linux capabilities và filesystem chỉ đọc.
- Nginx được cấu hình làm reverse proxy và bổ sung các security headers.

## Tác giả

Dự án thực hành xây dựng, triển khai và giám sát website tin tức bằng Docker.

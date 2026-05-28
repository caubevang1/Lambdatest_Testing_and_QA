# VolunteerHub — Hướng dẫn chạy E2E Test

## Yêu cầu trước khi chạy

| Công cụ | Phiên bản tối thiểu |
|---|---|
| Node.js | 18+ |
| Google Chrome | Phiên bản mới nhất |
| Docker | Bất kỳ |

---

## Khởi động môi trường

Mở **3 terminal riêng biệt**, chạy theo thứ tự:

**Terminal 1 — MongoDB (Docker Compose)**
```bash
docker compose up -d
```
> Dừng: `docker compose down` — Dừng và xóa data: `docker compose down -v`

**Terminal 2 — Backend**
```bash
cd backend
npm install
npm run dev
```
> Server khởi động tại `http://localhost:5000`
> Khi thấy `✅ Seeded default account: admin` là sẵn sàng.

**Terminal 3 — Frontend**
```bash
cd frontend
npm install
npm run dev
```
> App chạy tại `http://localhost:3000`

---

## Chạy test

**Toàn bộ test — có mở trình duyệt (khuyên dùng khi debug):**
```bash
cd frontend
npm run test:e2e
```

**Toàn bộ test — không mở trình duyệt (nhanh hơn, dùng cho CI):**
```bash
npm run test:e2e:headless
```

**Chạy một file test cụ thể:**
```bash
npx cross-env E2E_HEADLESS=false jest --config jest.selenium.config.cjs selenium/auth.e2e.test.cjs
```

**Chạy E2E trên TestMu AI cloud grid:**
```bash
cd frontend
npm run test:testmuai
```
> `LT_USERNAME` và `LT_ACCESS_KEY` được đọc tự động từ `frontend/.env`.

**Chạy một test case theo ID:**
```bash
npx cross-env E2E_HEADLESS=false jest --config jest.selenium.config.cjs -t "AUTH-04"
```

**Chạy một nhóm (describe):**
```bash
npx cross-env E2E_HEADLESS=false jest --config jest.selenium.config.cjs -t "Admin flows"
```

---

## Biến môi trường

| Biến | Mặc định | Mô tả |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` | URL frontend |
| `E2E_API_BASE` | `http://localhost:5000` | URL backend API |
| `E2E_HEADLESS` | `true` | `false` để mở trình duyệt |
| `E2E_OTP` | `123456` | OTP cố định (cần `OTP_TEST_MODE=true` ở backend) |
| `E2E_REMOTE` | `false` | `true` để chạy trên TestMu AI cloud grid |
| `LT_USERNAME` | - | Tài khoản TestMu AI |
| `LT_ACCESS_KEY` | - | Access key TestMu AI |
| `TESTMUAI_REMOTE_URL` | `https://hub.lambdatest.com/wd/hub` | Endpoint Selenium remote |
| `E2E_BUILD` | `VolunteerHub Jest Selenium` | Tên build hiển thị trên dashboard |

Khi `E2E_REMOTE=true`, driver sẽ dùng TestMu AI cloud grid và kết quả sẽ hiển thị trên dashboard automation, thay vì chạy Chrome local.

Ví dụ đổi port:
```bash
npx cross-env E2E_BASE_URL=http://localhost:5173 E2E_API_BASE=http://localhost:5000 E2E_HEADLESS=false jest --config jest.selenium.config.cjs
```

---

## Tài khoản mặc định (được seed tự động)

| Username | Password | Role |
|---|---|---|
| `admin` | `admin` | ADMIN |
| `eventmanager` | `eventmanager` | EVENTMANAGER |

> Tài khoản được tạo tự động khi backend khởi động lần đầu với MongoDB trống.

---

## Thứ tự thực thi

Các file chạy **tuần tự** (alphabetical) do `maxWorkers: 1`:

```
1. admin.e2e.test.cjs
2. auth.e2e.test.cjs
3. discussion.e2e.test.cjs
4. events.e2e.test.cjs
5. interactions.e2e.test.cjs
6. manager.e2e.test.cjs
7. rankings.e2e.test.cjs
8. rbac.e2e.test.cjs
9. volunteer.e2e.test.cjs
```

---

## Danh sách test cases

### Nhóm 1 — AUTH (auth.e2e.test.cjs)

| ID | Mô tả | Phương thức |
|---|---|---|
| AUTH-01 | Đăng ký tài khoản mới thành công bằng OTP cố định | UI |
| AUTH-02 | Đăng nhập thành công bằng username + password | UI |
| AUTH-03 | Đặt lại mật khẩu qua OTP email | UI |
| AUTH-04 | Đăng nhập sai mật khẩu → hiển thị thông báo lỗi | UI |
| AUTH-05 | Gửi OTP cho email đã đăng ký → API trả về lỗi 409 | API |
| AUTH-06 | Tài khoản bị khóa không thể đăng nhập | API + UI |
| AUTH-07 | Đổi mật khẩu khi đã đăng nhập | UI |
| AUTH-08 | Cập nhật thông tin profile | UI |

---

### Nhóm 2 — Event Lifecycle (events.e2e.test.cjs)

| ID | Mô tả | Phương thức |
|---|---|---|
| EVT-01 | Trang danh sách hiển thị card hoặc empty-state | UI |
| EVT-02 | Tìm kiếm từ khóa không tồn tại → kết quả rỗng | UI |
| EVT-03 | Click card sự kiện → mở đúng trang chi tiết | UI |
| EVT-04 | Manager tạo sự kiện → admin thấy trong danh sách chờ duyệt | API + UI |
| EVT-05 | Admin duyệt sự kiện → status chuyển thành `approved` | API + UI |
| EVT-06 | Manager đánh dấu sự kiện hoàn thành | API |
| RACE-REG-01 | Duyệt đồng thời 2 đăng ký → không vượt quá `maxParticipants` | API |

---

### Nhóm 3 — Volunteer (volunteer.e2e.test.cjs)

| ID | Mô tả | Phương thức |
|---|---|---|
| VOL-01 | Volunteer đăng ký sự kiện đã `approved` → status `pending` | UI + API verify |
| VOL-02 | Đăng ký cùng sự kiện 2 lần → báo lỗi trùng | UI |
| VOL-03 | Hủy đăng ký trước 2 ngày → không bị trừ điểm | UI + API verify |
| VOL-04 | Hủy đăng ký trong vòng 2 ngày → bị trừ 10 điểm | API |
| VOL-05 | Đăng ký sự kiện chưa được duyệt → API từ chối | API |
| VOL-06 | Đăng ký sự kiện đã đủ số lượng → báo hết chỗ | API |
| VOL-07 | Volunteer xem lịch sử đăng ký | API |
| VOL-08 | Chưa đăng nhập bấm đăng ký → redirect về login | UI |

---

### Nhóm 4 — Manager: Quản lý người tham gia (manager.e2e.test.cjs)

| ID | Mô tả | Phương thức |
|---|---|---|
| MGR-01 | Sự kiện vừa tạo xuất hiện trong trang quản lý | UI |
| MGR-02 | Manager duyệt đăng ký volunteer → status `approved` | API + UI verify |
| MGR-03 | Manager từ chối đăng ký volunteer → status `rejected` | API |
| MGR-04 | Đánh giá **GOOD** → volunteer nhận đủ điểm sự kiện | API + UI |
| MGR-05 | Đánh giá **AVERAGE** → volunteer nhận 50% điểm | API |
| MGR-06 | Đánh giá **BAD** → volunteer nhận 20% điểm | API |
| MGR-07 | Đánh giá **NO_SHOW** → volunteer bị trừ 10 điểm | API |
| MGR-08 | Manager xem danh sách người tham gia | API + UI |

**Quy tắc tính điểm:**

| Đánh giá | Điểm nhận |
|---|---|
| GOOD | 100% điểm sự kiện |
| AVERAGE | 50% điểm sự kiện |
| BAD | 20% điểm sự kiện |
| NO_SHOW | −10 điểm |

---

### Nhóm 5 — Admin: Quản lý người dùng (admin.e2e.test.cjs)

| ID | Mô tả | Phương thức |
|---|---|---|
| ADM-01 | Admin thấy danh sách sự kiện chờ duyệt có nội dung thực | UI |
| ADM-02 | Admin xem danh sách người dùng | UI |
| ADM-03 | Admin khóa tài khoản → user không đăng nhập được | API + UI |
| ADM-04 | Admin mở khóa tài khoản → user đăng nhập được lại | API + UI |
| ADM-05 | Admin thay đổi role người dùng | API + UI verify |
| ADM-06 | Admin không thể tự thay đổi role của chính mình | API |

---

### Nhóm 6 — Discussion (discussion.e2e.test.cjs)

| ID | Mô tả | Phương thức |
|---|---|---|
| DISC-01 | Volunteer đã được duyệt tạo post trong discussion | UI + API verify |
| DISC-02 | Volunteer chưa tham gia bị chặn tạo post | API |
| DISC-03 | Tạo comment trong một post | UI + API verify |
| DISC-04 | Like / Unlike một post | API |
| DISC-05 | Người dùng chưa đăng nhập bị chặn vào discussion | UI |

> **Setup yêu cầu:** DISC-01, 03, 04, 05 cần: Manager tạo sự kiện → Admin duyệt → Volunteer đăng ký → Manager duyệt đăng ký. Tất cả được thực hiện tự động qua API trong `beforeEach`.

---

### Nhóm 7 — Event Interactions (interactions.e2e.test.cjs)

| ID | Mô tả | Phương thức |
|---|---|---|
| INT-01 | Like sự kiện → `likesCount` tăng 1 | UI + API verify |
| INT-02 | Unlike sự kiện (toggle) → `likesCount` giảm | API |
| INT-03 | Share sự kiện → trả về `shareLink` hợp lệ | UI + API verify |

---

### Nhóm 8 — RBAC: Phân quyền (rbac.e2e.test.cjs)

| ID | Mô tả | Phương thức |
|---|---|---|
| RBAC-01 | Volunteer không thấy link "Trang admin" trên header | UI |
| RBAC-02 | Volunteer truy cập URL `/admin/*` → bị chặn/redirect | UI |
| RBAC-03 | Volunteer truy cập URL `/quanlisukien/*` → bị chặn | UI |
| RBAC-04 | Manager không thấy link "Trang admin" | UI |
| RBAC-05 | Manager truy cập URL `/admin/*` → bị chặn | UI |
| RBAC-06 | Chưa đăng nhập truy cập trang cần auth → redirect | UI |

---

### Nhóm 9 — Rankings & Statistics (rankings.e2e.test.cjs)

| ID | Mô tả | Phương thức |
|---|---|---|
| RANK-01 | Trang xếp hạng volunteer hiển thị danh sách | API + UI |
| RANK-02 | Trang xếp hạng manager hiển thị danh sách | API + UI |
| STAT-01 | Admin dashboard hiển thị số liệu thống kê | API + UI |

---

## Tổng kết

| Nhóm | Số test | File |
|---|---|---|
| AUTH | 8 | auth.e2e.test.cjs |
| Event Lifecycle | 7 | events.e2e.test.cjs |
| Volunteer | 8 | volunteer.e2e.test.cjs |
| Manager | 8 | manager.e2e.test.cjs |
| Admin | 6 | admin.e2e.test.cjs |
| Discussion | 5 | discussion.e2e.test.cjs |
| Interactions | 3 | interactions.e2e.test.cjs |
| RBAC | 6 | rbac.e2e.test.cjs |
| Rankings | 3 | rankings.e2e.test.cjs |
| **Tổng** | **54** | **9 file** |

---

## Xử lý lỗi thường gặp

**`SessionNotCreatedException` hoặc ChromeDriver version mismatch:**
```bash
npx cross-env E2E_CHROME_DRIVER=/path/to/chromedriver jest --config jest.selenium.config.cjs
```
Tải ChromeDriver tại: https://chromedriver.chromium.org/downloads (chọn đúng phiên bản Chrome)

**Test timeout:**
- Tăng `testTimeout` trong `jest.selenium.config.cjs`
- Kiểm tra backend đang chạy tại đúng port

**`Cannot find module './helpers'`:**
```bash
cd frontend
npm install
```

**MongoDB connection failed:**
```bash
docker compose ps        # kiem tra container co dang chay khong
docker compose up -d     # khoi dong lai neu chua chay
```

**Seed không chạy (không thấy `✅ Seeded`):**
- Kiểm tra backend `.env` có `MONGO_URI=mongodb://localhost:27017/volunteerhub`
- Restart backend sau khi đổi `.env`

# 🚀 VICO KAIZEN AI - Hệ Thống CSDL & Đánh Giá Trùng Lặp Ý Tưởng Cải Tiến

Hệ thống quản lý, tổng hợp CSDL cải tiến và đánh giá trùng lặp ý tưởng bằng AI cho công ty VICO. 

Tích hợp kho CSDL **556 đề tài Kaizen** (gồm 80 Kaizen master 2020-2025 và 476 Kaizen mới từ Google Sheet trực tuyến), ứng dụng tự động phân tích ngữ nghĩa ngôn ngữ tự nhiên Tiếng Việt và đưa ra gợi ý mức thưởng mở rộng **50%** theo quy định của công ty.

---

## 🌟 Tính Năng Chính

1. **🤖 AI Duplicate Evaluator (01 Khung nhập duy nhất):**
   - Dán toàn bộ nội dung đề tài cải tiến vào 1 ô duy nhất.
   - AI quét độ tương đồng %, hiển thị Gauge trực quan, gắn nhãn cảnh báo (🔴 **TRÙNG LẮP CAO**, 🟡 **GIẢI PHÁP MỞ RỘNG (THƯỞNG 50%)**, 🟢 **Ý TƯỞNG MỚI (THƯỞNG 100%)**).

2. **💰 Quy Định Khen Thưởng 50% Cho Giải Pháp Mở Rộng:**
   - **0% Tiền thưởng:** Đề tài trùng lặp hoàn toàn (>= 70%).
   - **50% Tiền thưởng giải pháp gốc:** Đề tài có giải pháp tương tự hoặc nhân rộng từ Kaizen cũ (35% - 70%).
   - **100% Tiền thưởng:** Đề tài mới hoàn toàn độc lập (< 35%).

3. **📚 Tra Cứu Kho Kaizen (556 Đề Tài):**
   - Tìm kiếm từ khóa tức thì (Full-Text Search FTS5 Tiếng Việt).
   - Bộ lọc theo Đơn vị / Phân xưởng và Trạng thái.
   - Xem Modal chi tiết Thực trạng / Giải pháp / Lợi ích từng đề tài.

4. **🔄 Nút Đồng Bộ Google Sheet 1-Click:**
   - Tải dữ liệu mới nhất từ Google Sheet trực tuyến chỉ với 1 click.

---

## 🛠️ Cấu Trúc Dự Án

```
├── web_server.py           # FastAPI Web Server & REST APIs
├── kaizen_ai_checker.py    # Engine AI Đánh giá Trùng lặp (TF-IDF + Cosine Similarity)
├── aggregate_kaizen_db.py  # ETL Pipeline tổng hợp CSDL (Master Excel + Google Sheet)
├── check_kaizen.py         # Công cụ CLI kiểm tra trùng lặp từ dòng lệnh
├── test_ai_checker.py      # Kịch bản kiểm thử tự động
├── templates/
│   └── index.html          # Giao diện Web App (Dark Glassmorphism UI)
└── static/
    ├── style.css           # Custom CSS Stylings
    └── app.js              # Client JavaScript & API Handler
```

---

## 🚀 Hướng Dẫn Chạy Dự Án

### 1. Cài đặt thư viện Python:
```bash
pip install fastapi uvicorn pandas openpyxl scikit-learn numpy
```

### 2. Tổng hợp CSDL Kaizen (Tạo database):
```bash
python aggregate_kaizen_db.py
```

### 3. Khởi chạy Web Application:
```bash
python web_server.py
```
Truy cập địa chỉ trên trình duyệt: **`http://localhost:8000`**

---

## 📄 Giấy Phép
Bản quyền thuộc về **VICO Kaizen Team**.

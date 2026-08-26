import openpyxl
import sqlite3
import json
import os
import re
import io
import urllib.request
import pandas as pd
from datetime import datetime

# Source files
excel_file = '3. KAIZEN - BM.xlsx'
json_raw_file = 'extracted_raw.json'
google_sheet_csv_url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS3V5Gp8fEM7amTugmV5tXM6ROfKi2X_q-WABk9TJutPITpF0tJd1gBWQ-tKaCHnKpvBqEHymFWbdVT/pub?gid=693129581&single=true&output=csv'

print("Starting Kaizen Database aggregation (Master Excel + Live Google Sheet)...")

records = []
image_dir = 'excel_images'

# -------------------------------------------------------------
# 1. FETCH & PARSE LIVE GOOGLE SHEET (470+ NEW KAIZENS)
# -------------------------------------------------------------
print(f"Fetching live Google Sheet data from URL...")
gs_records = []
try:
    req = urllib.request.Request(google_sheet_csv_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as response:
        csv_bytes = response.read()

    df_gs = pd.read_csv(io.BytesIO(csv_bytes), header=None)
    print(f"Downloaded Google Sheet: {len(df_gs)} raw rows.")

    for idx, row in df_gs.iterrows():
        row_text = '\n'.join([str(val) for val in row.values if pd.notna(val) and str(val).strip()])
        if '💡 Tên ý tưởng:' not in row_text and '💡 Mã ý tưởng:' not in row_text:
            continue

        title_m = re.search(r'💡 Tên ý tưởng:\s*(.*?)(?=\n💡|\n👤|\n🏢|\n📅|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n💰|\n🎁|\n📊|$)', row_text, re.DOTALL)
        code_m = re.search(r'💡 Mã ý tưởng:\s*(.*?)(?=\n👤|\n🏢|\n📅|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n💰|\n🎁|\n📊|$)', row_text, re.DOTALL)
        author_m = re.search(r'👤 Họ và tên tác giả:\s*(.*?)(?=\n🏢|\n📅|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n💰|\n🎁|\n📊|$)', row_text, re.DOTALL)
        unit_m = re.search(r'🏢 Đơn vị:\s*(.*?)(?=\n📅|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n💰|\n🎁|\n📊|$)', row_text, re.DOTALL)
        date_m = re.search(r'📅 Ngày gửi:\s*(.*?)(?=\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n💰|\n🎁|\n📊|$)', row_text, re.DOTALL)

        status_m = re.search(r'⚠️ Hiện trạng và vấn đề:\s*(.*?)(?=\n🛠️|\n✨|\n💪|\n🚀|\n💰|\n🎁|\n📊|$)', row_text, re.DOTALL)
        solution_m = re.search(r'🛠️ Giải pháp:\s*(.*?)(?=\n✨|\n💪|\n🚀|\n💰|\n🎁|\n📊|$)', row_text, re.DOTALL)
        benefits_m = re.search(r'✨ Tính lợi ích:\s*(.*?)(?=\n💪|\n🚀|\n💰|\n🎁|\n📊|$)', row_text, re.DOTALL)
        resources_m = re.search(r'💪 Nguồn lực thực hiện:\s*(.*?)(?=\n🚀|\n💰|\n🎁|\n📊|$)', row_text, re.DOTALL)
        expansion_m = re.search(r'🚀 Cơ hội nhân rộng phát triển:\s*(.*?)(?=\n💰|\n🎁|\n📊|$)', row_text, re.DOTALL)

        val_m = re.search(r'💰 Giá trị làm lợi:\s*([^\n\r]+)', row_text)
        rw_m = re.search(r'🎁 Tiền thưởng:\s*([^\n\r]+)', row_text)

        system_status_m = re.search(r'📊 Trạng thái \(hệ thống\):\s*(.*?)(?=\n📊|\n💡|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\nGộp|$)', row_text, re.DOTALL)
        tk_status_m = re.search(r'📊 Trạng thái triển khai \(TĐV\):\s*(.*?)(?=\n📊|\n💡|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\nGộp|$)', row_text, re.DOTALL)
        dt_status_m = re.search(r'📊 Trạng thái duy trì/mở rộng \(TĐV\):\s*(.*?)(?=\n📊|\n💡|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\nGộp|$)', row_text, re.DOTALL)

        title = title_m.group(1).strip() if title_m else ''
        code = code_m.group(1).strip() if code_m else f'GS-2026-{idx+1}'
        author = author_m.group(1).strip() if author_m and author_m.group(1).strip() != '*empty*' else 'Google Sheet Trực Tuyến'
        unit = unit_m.group(1).strip() if unit_m and unit_m.group(1).strip() != '*empty*' else 'Hệ thống mới'
        sent_date = date_m.group(1).strip() if date_m and date_m.group(1).strip() != '*empty*' else datetime.now().strftime('%d/%m/%Y')

        status_quo = status_m.group(1).strip() if status_m else ''
        solution = solution_m.group(1).strip() if solution_m else ''
        benefits = benefits_m.group(1).strip() if benefits_m else ''
        resources = resources_m.group(1).strip() if resources_m else ''
        expansion = expansion_m.group(1).strip() if expansion_m else ''
        
        val_str = val_m.group(1).strip() if val_m else ''
        rw_str = rw_m.group(1).strip() if rw_m else ''
        val_num = re.sub(r'[^\d]', '', val_str)
        rw_num = re.sub(r'[^\d]', '', rw_str)
        val_vnd = float(val_num) if val_num else None
        reward_vnd = float(rw_num) if rw_num else None

        status = system_status_m.group(1).strip() if system_status_m and system_status_m.group(1).strip() != '*empty*' else 'Đề nghị mới'
        tk_status = tk_status_m.group(1).strip() if tk_status_m and tk_status_m.group(1).strip() != '*empty*' else ''
        dt_status = dt_status_m.group(1).strip() if dt_status_m and dt_status_m.group(1).strip() != '*empty*' else ''

        if title:
            full_text = f"Mã: {code} | Tên ý tưởng: {title} | Tác giả: {author} | Đơn vị: {unit} | Thực trạng: {status_quo} | Giải pháp: {solution} | Lợi ích: {benefits} | Nhân rộng: {expansion} | Nguồn lực: {resources}"
            gs_records.append({
                'ma_kaizen': code,
                'nam': 2026,
                'ten_y_tuong': title,
                'don_vi': unit,
                'vi_tri': '',
                'nguoi_de_xuat': author,
                'thuc_trang': status_quo,
                'giai_phap': solution,
                'nguon_luc': resources,
                'danh_gia_hieu_qua': benefits,
                'co_hoi_nhan_rong': expansion,
                'mo_ta_cach_tinh': '',
                'gia_tri_lam_loi_vnd': val_vnd,
                'tien_thuong_vnd': reward_vnd,
                'tinh_trang_khen_thuong': 'Đã khen thưởng' if reward_vnd else '',
                'trang_thai': status,
                'trang_thai_trien_khai': tk_status,
                'trang_thai_duy_tri': dt_status,
                'phan_loai': 'Google Sheet Kaizen',
                'ngay_gui': sent_date,
                'hinh_anh_truoc': '',
                'hinh_anh_sau': '',
                'full_text_search': full_text
            })

    print(f"Successfully extracted {len(gs_records)} Kaizens from Google Sheet.")
except Exception as e:
    print(f"Warning: Failed to fetch Google Sheet data: {e}")

records.extend(gs_records)

# -------------------------------------------------------------
# 2. PARSE LOCAL MASTER EXCEL (80+ KAIZENS 2020-2025)
# -------------------------------------------------------------
raw_extra = {}
if os.path.exists(json_raw_file):
    try:
        with open(json_raw_file, 'r', encoding='utf-8') as f:
            raw_extra = json.load(f)
    except Exception as e:
        pass

if os.path.exists(excel_file):
    wb = openpyxl.load_workbook(excel_file, read_only=True, data_only=True)
    ws = wb['DATABASE-KAIZEN']

    for row_idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
        if row_idx == 1 or not row or len(row) < 6:
            continue

        code = None
        if row[2] and str(row[2]).strip().startswith('KZ'):
            code = str(row[2]).strip()
        elif row[5] and str(row[5]).strip().startswith('KZ'):
            code = str(row[5]).strip()

        if not code:
            continue

        year = row[1] if len(row) > 1 and row[1] is not None else ''
        unit = str(row[3]).strip() if len(row) > 3 and row[3] is not None else ''
        location = str(row[4]).strip() if len(row) > 4 and row[4] is not None else ''
        title = str(row[5]).strip() if len(row) > 5 and row[5] is not None else ''
        status_quo = str(row[6]).strip() if len(row) > 6 and row[6] is not None else ''
        solution = str(row[7]).strip() if len(row) > 7 and row[7] is not None else ''
        resources = str(row[8]).strip() if len(row) > 8 and row[8] is not None else ''
        benefits = str(row[9]).strip() if len(row) > 9 and row[9] is not None else ''
        next_steps = str(row[10]).strip() if len(row) > 10 and row[10] is not None else ''
        lessons = str(row[11]).strip() if len(row) > 11 and row[11] is not None else ''

        date_sent_raw = row[12] if len(row) > 12 else None
        if isinstance(date_sent_raw, datetime):
            date_sent = date_sent_raw.strftime('%d/%m/%Y')
        elif date_sent_raw:
            date_sent = str(date_sent_raw).strip()
        else:
            date_sent = ''

        submitter = str(row[13]).strip() if len(row) > 13 and row[13] is not None else ''
        submitter_unit = str(row[14]).strip() if len(row) > 14 and row[14] is not None else ''

        if not unit and submitter_unit:
            unit = submitter_unit

        expansion = str(row[18]).strip() if len(row) > 18 and row[18] is not None else ''
        calc_desc = str(row[22]).strip() if len(row) > 22 and row[22] is not None else ''
        value_vnd = row[23] if len(row) > 23 and isinstance(row[23], (int, float)) else None
        reward_vnd = row[24] if len(row) > 24 and isinstance(row[24], (int, float)) else None
        reward_status = str(row[30]).strip() if len(row) > 30 and row[30] is not None else ''
        category = str(row[37]).strip() if len(row) > 37 and row[37] is not None else ''
        status = str(row[39]).strip() if len(row) > 39 and row[39] is not None else ''

        img_before = f"{image_dir}/{code}_before.png" if os.path.exists(f"{image_dir}/{code}_before.png") else ''
        img_after = f"{image_dir}/{code}_after.png" if os.path.exists(f"{image_dir}/{code}_after.png") else ''

        if code in raw_extra:
            extra_data = raw_extra[code]
            if isinstance(extra_data, dict):
                if not title and 'idea' in extra_data:
                    title = extra_data['idea']
                if not status_quo and 'status_quo' in extra_data:
                    status_quo = extra_data['status_quo']
                if not solution and 'solution' in extra_data:
                    solution = extra_data['solution']
                if not benefits and 'benefits' in extra_data:
                    benefits = extra_data['benefits']

        full_text = f"Mã: {code} | Tên ý tưởng: {title} | Đơn vị: {unit} | Người đề xuất: {submitter} | Thực trạng: {status_quo} | Giải pháp: {solution} | Lợi ích: {benefits} | Nhân rộng: {expansion} | Nguồn lực: {resources}"

        records.append({
            'ma_kaizen': code,
            'nam': year,
            'ten_y_tuong': title,
            'don_vi': unit,
            'vi_tri': location,
            'nguoi_de_xuat': submitter,
            'thuc_trang': status_quo,
            'giai_phap': solution,
            'nguon_luc': resources,
            'danh_gia_hieu_qua': benefits,
            'co_hoi_nhan_rong': expansion,
            'mo_ta_cach_tinh': calc_desc,
            'gia_tri_lam_loi_vnd': value_vnd,
            'tien_thuong_vnd': reward_vnd,
            'tinh_trang_khen_thuong': reward_status,
            'trang_thai': status if status else 'Đã triển khai',
            'phan_loai': category if category else 'Master Kaizen',
            'ngay_gui': date_sent,
            'hinh_anh_truoc': img_before,
            'hinh_anh_sau': img_after,
            'full_text_search': full_text
        })

# -------------------------------------------------------------
# 3. DEDUPLICATE & SAVE DATABASES
# -------------------------------------------------------------
unique_records_dict = {}
for rec in records:
    code = rec['ma_kaizen']
    if code not in unique_records_dict:
        unique_records_dict[code] = rec
    else:
        existing = unique_records_dict[code]
        score_existing = sum(1 for v in existing.values() if v is not None and str(v).strip() != '')
        score_new = sum(1 for v in rec.values() if v is not None and str(v).strip() != '')
        if score_new > score_existing:
            unique_records_dict[code] = rec

records = list(unique_records_dict.values())
print(f"Total Combined & Deduplicated Kaizen Records: {len(records)}")

# SQLite Database
db_file = 'kaizen_database.db'
if os.path.exists(db_file):
    os.remove(db_file)

conn = sqlite3.connect(db_file)
cursor = conn.cursor()

cursor.execute('''
CREATE TABLE kaizen_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_kaizen TEXT UNIQUE NOT NULL,
    nam INTEGER,
    ten_y_tuong TEXT NOT NULL,
    don_vi TEXT,
    vi_tri TEXT,
    nguoi_de_xuat TEXT,
    thuc_trang TEXT,
    giai_phap TEXT,
    nguon_luc TEXT,
    danh_gia_hieu_qua TEXT,
    co_hoi_nhan_rong TEXT,
    mo_ta_cach_tinh TEXT,
    gia_tri_lam_loi_vnd REAL,
    tien_thuong_vnd REAL,
    tinh_trang_khen_thuong TEXT,
    trang_thai TEXT,
    phan_loai TEXT,
    ngay_gui TEXT,
    hinh_anh_truoc TEXT,
    hinh_anh_sau TEXT,
    full_text_search TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
''')

cursor.execute('''
CREATE VIRTUAL TABLE kaizen_fts USING fts5(
    ma_kaizen,
    ten_y_tuong,
    don_vi,
    thuc_trang,
    giai_phap,
    danh_gia_hieu_qua,
    full_text_search
)
''')

for rec in records:
    cursor.execute('''
    INSERT INTO kaizen_records (
        ma_kaizen, nam, ten_y_tuong, don_vi, vi_tri, nguoi_de_xuat,
        thuc_trang, giai_phap, nguon_luc, danh_gia_hieu_qua, co_hoi_nhan_rong,
        mo_ta_cach_tinh, gia_tri_lam_loi_vnd, tien_thuong_vnd, tinh_trang_khen_thuong,
        trang_thai, phan_loai, ngay_gui, hinh_anh_truoc, hinh_anh_sau, full_text_search
    ) VALUES (
        :ma_kaizen, :nam, :ten_y_tuong, :don_vi, :vi_tri, :nguoi_de_xuat,
        :thuc_trang, :giai_phap, :nguon_luc, :danh_gia_hieu_qua, :co_hoi_nhan_rong,
        :mo_ta_cach_tinh, :gia_tri_lam_loi_vnd, :tien_thuong_vnd, :tinh_trang_khen_thuong,
        :trang_thai, :phan_loai, :ngay_gui, :hinh_anh_truoc, :hinh_anh_sau, :full_text_search
    )
    ''', rec)

    cursor.execute('''
    INSERT INTO kaizen_fts (
        ma_kaizen, ten_y_tuong, don_vi, thuc_trang, giai_phap, danh_gia_hieu_qua, full_text_search
    ) VALUES (
        ?, ?, ?, ?, ?, ?, ?
    )
    ''', (
        rec['ma_kaizen'], rec['ten_y_tuong'], rec['don_vi'], rec['thuc_trang'],
        rec['giai_phap'], rec['danh_gia_hieu_qua'], rec['full_text_search']
    ))

conn.commit()
conn.close()
print(f"SQLite Database successfully updated: {db_file}")

# JSON Database
json_file = 'kaizen_database.json'
with open(json_file, 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, indent=2)
print(f"JSON Database successfully updated: {json_file}")

# CSV & Excel Databases
df = pd.DataFrame(records)
csv_file = 'kaizen_database.csv'
df.to_csv(csv_file, index=False, encoding='utf-8-sig')
print(f"CSV Database successfully updated: {csv_file}")

excel_export_file = 'kaizen_database.xlsx'
with pd.ExcelWriter(excel_export_file, engine='openpyxl') as writer:
    df.to_excel(writer, sheet_name='Cơ sở dữ liệu Cải tiến', index=False)
print(f"Excel Database successfully updated: {excel_export_file}")

print("Aggregation completed successfully!")

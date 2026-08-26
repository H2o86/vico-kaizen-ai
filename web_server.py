import os
import sqlite3
import json
import uvicorn
from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from kaizen_ai_checker import KaizenDuplicateChecker

app = FastAPI(title="VICO Kaizen AI Web Tool", version="2.5")

# Ensure static & templates dirs exist
os.makedirs("static", exist_ok=True)
os.makedirs("templates", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")

# Initialize AI Checker Engine
ai_checker = KaizenDuplicateChecker(db_path='kaizen_database.db')

class EvaluateRequest(BaseModel):
    content: str = ""
    title: str = ""
    status_quo: str = ""
    solution: str = ""
    unit: str = ""
    top_k: int = 5

def get_env_gemini_key():
    key = os.getenv("GEMINI_API_KEY", "")
    if not key and os.path.exists(".env"):
        try:
            with open(".env", "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("GEMINI_API_KEY="):
                        key = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return key

@app.get("/", response_class=FileResponse)
async def serve_index():
    return FileResponse("templates/index.html")

@app.get("/api/stats")
async def get_stats():
    conn = sqlite3.connect('kaizen_database.db')
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM kaizen_records")
    total_kaizens = cursor.fetchone()[0]

    cursor.execute("SELECT trang_thai, COUNT(*) FROM kaizen_records GROUP BY trang_thai ORDER BY COUNT(*) DESC")
    status_counts = dict(cursor.fetchall())

    cursor.execute("SELECT don_vi, COUNT(*) FROM kaizen_records GROUP BY don_vi ORDER BY COUNT(*) DESC LIMIT 10")
    unit_counts = dict(cursor.fetchall())

    cursor.execute("SELECT nam, COUNT(*) FROM kaizen_records GROUP BY nam ORDER BY nam ASC")
    year_counts = dict(cursor.fetchall())

    conn.close()

    return {
        "total_kaizens": total_kaizens,
        "status_counts": status_counts,
        "unit_counts": unit_counts,
        "year_counts": year_counts
    }

@app.get("/api/kaizens")
async def get_kaizens(
    q: str = Query("", description="Từ khóa tìm kiếm"),
    unit: str = Query("", description="Lọc theo đơn vị"),
    status: str = Query("", description="Lọc theo trạng thái"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    conn = sqlite3.connect('kaizen_database.db')
    cursor = conn.cursor()

    offset = (page - 1) * limit
    params = []
    where_clauses = []

    if q.strip():
        where_clauses.append("(ma_kaizen LIKE ? OR ten_y_tuong LIKE ? OR thuc_trang LIKE ? OR giai_phap LIKE ? OR don_vi LIKE ?)")
        pattern = f"%{q.strip()}%"
        params.extend([pattern, pattern, pattern, pattern, pattern])

    if unit.strip():
        where_clauses.append("don_vi = ?")
        params.append(unit.strip())

    if status.strip():
        where_clauses.append("trang_thai = ?")
        params.append(status.strip())

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    count_query = f"SELECT COUNT(*) FROM kaizen_records{where_sql}"
    cursor.execute(count_query, params)
    total_count = cursor.fetchone()[0]

    data_query = f"""
        SELECT id, ma_kaizen, nam, ten_y_tuong, don_vi, nguoi_de_xuat,
               thuc_trang, giai_phap, nguon_luc, danh_gia_hieu_qua,
               trang_thai, phan_loai, ngay_gui, hinh_anh_truoc, hinh_anh_sau
        FROM kaizen_records
        {where_sql}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
    """
    cursor.execute(data_query, params + [limit, offset])
    rows = cursor.fetchall()
    conn.close()

    kaizens = []
    for r in rows:
        kaizens.append({
            "id": r[0],
            "ma_kaizen": r[1],
            "nam": r[2],
            "ten_y_tuong": r[3],
            "don_vi": r[4],
            "nguoi_de_xuat": r[5],
            "thuc_trang": r[6],
            "giai_phap": r[7],
            "nguon_luc": r[8],
            "danh_gia_hieu_qua": r[9],
            "trang_thai": r[10],
            "phan_loai": r[11],
            "ngay_gui": r[12],
            "hinh_anh_truoc": r[13],
            "hinh_anh_sau": r[14]
        })

    return {
        "total": total_count,
        "page": page,
        "limit": limit,
        "total_pages": (total_count + limit - 1) // limit,
        "kaizens": kaizens
    }

@app.post("/api/evaluate")
async def evaluate_kaizen(req: EvaluateRequest):
    # Support both single content field or legacy multi-field format
    full_content = req.content.strip()
    if not full_content:
        full_content = f"{req.title} {req.status_quo} {req.solution} {req.unit}".strip()

    if not full_content:
        return JSONResponse(status_code=400, content={"error": "Nội dung ý tưởng không được để trống."})

    res = ai_checker.evaluate_proposal(
        content_text=full_content,
        top_k=req.top_k
    )
    return res

@app.post("/api/evaluate_gemini")
async def evaluate_gemini(req: EvaluateRequest):
    content_text = req.content.strip()
    if not content_text:
        return JSONResponse(status_code=400, content={"error": "Nội dung không được để trống."})

    api_key = get_env_gemini_key()
    if not api_key:
        return JSONResponse(status_code=500, content={"error": "Chưa tìm thấy GEMINI_API_KEY trong file .env trên server."})

    res_vec = ai_checker.evaluate_proposal(content_text=content_text, top_k=req.top_k)
    candidates = res_vec.get("matched_kaizens", [])

    cand_text = ""
    for idx, c in enumerate(candidates):
        cand_text += f"\n{idx+1}. Mã Kaizen: [{c['ma_kaizen']}] | Năm: {c['nam']} | Tác giả: {c['nguoi_de_xuat']} ({c.get('don_vi', 'VICO')})\n   Tên ý tưởng: {c['ten_y_tuong']}\n   Thực trạng: {c.get('thuc_trang', 'N/A')}\n   Giải pháp: {c.get('giai_phap', 'N/A')}\n   Thưởng gốc: {c.get('tien_thuong_vnd', 'Theo quy chế VICO')}\n"

    prompt_text = f"""Bạn là Chuyên gia Cao cấp Đánh giá Cải tiến (Senior Kaizen Specialist) của Công ty VICO.
Nhiệm vụ của bạn là đọc hiểu bản chất kỹ thuật, thực trạng và giải pháp của đề tài mới, sau đó đối chiếu ngữ nghĩa sâu với danh sách các đề tài đã có trong CSDL VICO bên dưới.

NỘI DUNG ĐỀ TÀI CẢI TIẾN MỚI CẦN ĐÁNH GIÁ:
\"\"\"
{content_text}
\"\"\"

DANH SÁCH {len(candidates)} ĐỀ TÀI LỊCH SỬ CÓ KHẢ NĂNG TƯƠNG ĐỒNG CAO NHẤT TRONG CSDL VICO:
{cand_text}

QUY TẮC ĐÁNH GIÁ & KHEN THƯỞNG CỦA VICO:
1. Trùng lặp hoàn toàn (>= 70%): Phân loại "🔴 TRÙNG LẮP HOÀN TOÀN" (Mức thưởng: 0 VNĐ - Bác bỏ).
2. Giải pháp mở rộng/nhân rộng (35% - 69%): Phân loại "🟡 GIẢI PHÁP MỞ RỘNG / TƯƠNG TỰ (THƯỞNG 50%)" (Mức thưởng = 50% mức thưởng gốc).
3. Ý tưởng mới độc lập (< 35%): Phân loại "🟢 Ý TƯỞNG MỚI ĐỘC LẬP (THƯỞNG 100%)".

YÊU CẦU TRẢ VỀ:
Hãy trả về DUY NHẤT một chuỗi JSON hợp lệ (không kèm Markdown code block hay text thừa) theo đúng cấu trúc:
{{
  "max_similarity_pct": 45.0,
  "risk_level": "🟡 GIẢI PHÁP MỞ RỘNG / TƯƠNG TỰ (THƯỞNG 50%)",
  "risk_code": "EXPANDED_SOLUTION",
  "reward_policy": "Viết kết luận tổng quan ngắn gọn, tính mức thưởng 50% cụ thể nếu đề tài gốc có tiền thưởng.",
  "matched_analysis": [
     {{
        "ma_kaizen": "Mã Kaizen",
        "similarity_pct": 45.0,
        "reasoning": "Viết 1-2 câu nhận xét ngắn gọn điểm giống và khác về kỹ thuật."
     }}
  ]
}}"""

    GEMINI_MODELS = [
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-2.0-flash-exp",
        "gemini-2.5-flash"
    ]

    import urllib.request
    gemini_json = None
    last_err = ""
    used_model = ""

    for model_name in GEMINI_MODELS:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            payload = json.dumps({"contents": [{"parts": [{"text": prompt_text}]}]}).encode("utf-8")
            req_obj = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req_obj, timeout=15) as resp:
                if resp.status == 200:
                    gemini_json = json.loads(resp.read().decode("utf-8"))
                    used_model = model_name
                    break
        except Exception as e:
            last_err = str(e)

    if not gemini_json:
        return JSONResponse(status_code=500, content={"error": f"Lỗi Gemini API: {last_err}"})

    raw_text = gemini_json.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    cleaned_json = raw_text.replace("```json", "").replace("```", "").strip()
    try:
        parsed_res = json.loads(cleaned_json)
    except:
        import re
        m = re.search(r"\{[\s\S]*\}", raw_text)
        if m:
            parsed_res = json.loads(m.group(0))
        else:
            return JSONResponse(status_code=500, content={"error": "Không thể parse JSON từ Gemini API."})

    merged_matches = []
    for c in candidates:
        llm_item = next((m for m in parsed_res.get("matched_analysis", []) if m.get("ma_kaizen") == c["ma_kaizen"]), None)
        c_copy = dict(c)
        if llm_item:
            c_copy["overall_similarity_pct"] = llm_item.get("similarity_pct", c["overall_similarity_pct"])
            c_copy["llm_reasoning"] = llm_item.get("reasoning")
        merged_matches.append(c_copy)

    return {
        "max_similarity_pct": parsed_res.get("max_similarity_pct", res_vec.get("max_similarity_pct")),
        "risk_level": parsed_res.get("risk_level", res_vec.get("risk_level")),
        "risk_code": parsed_res.get("risk_code", res_vec.get("risk_code")),
        "reward_policy": f"🧠 [KẾT QUẢ ĐÁNH GIÁ CHUYÊN SÂU BỞI GEMINI AI ({used_model})]\n\n" + parsed_res.get("reward_policy", ""),
        "matched_kaizens": merged_matches
    }

@app.post("/api/sync")
async def sync_google_sheet():
    global ai_checker
    try:
        import subprocess
        res = subprocess.run(["python", "aggregate_kaizen_db.py"], capture_output=True, text=True)
        ai_checker = KaizenDuplicateChecker(db_path='kaizen_database.db')
        return {"status": "success", "message": "Đã đồng bộ thành công CSDL từ Google Sheet!", "output": res.stdout}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Lỗi đồng bộ: {str(e)}"})

if __name__ == '__main__':
    print("Starting VICO Kaizen AI Web Server on http://localhost:8000 ...")
    uvicorn.run("web_server:app", host="0.0.0.0", port=8000, reload=False)

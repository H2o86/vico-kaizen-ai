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

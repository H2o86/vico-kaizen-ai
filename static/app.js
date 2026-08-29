let currentPage = 1;
let searchDebounceTimer = null;
let allKaizensCache = [];
let isLocalServer = true;

const LIVE_GS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS3V5Gp8fEM7amTugmV5tXM6ROfKi2X_q-WABk9TJutPITpF0tJd1gBWQ-tKaCHnKpvBqEHymFWbdVT/pub?gid=693129581&single=true&output=csv';

const APP_VERSION = "v560.1";
const APP_BUILD_TIME = "29/08/2026 - 13:09";

document.addEventListener("DOMContentLoaded", async () => {
    setElementText("sys-version-tag", APP_VERSION);
    setElementText("sys-build-time", APP_BUILD_TIME);
    loadGeminiKey();
    await initApp();
});

function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function saveGeminiKey() {
    const input = document.getElementById("gemini-api-key");
    if (input) {
        const val = input.value.trim();
        if (val) {
            localStorage.setItem("VICO_GEMINI_API_KEY", val);
            input.classList.remove("highlight-input");
        } else {
            localStorage.removeItem("VICO_GEMINI_API_KEY");
        }
    }
}

function loadGeminiKey() {
    const saved = localStorage.getItem("VICO_GEMINI_API_KEY");
    const input = document.getElementById("gemini-api-key");
    if (saved && input) {
        input.value = saved;
    }
}

function getGeminiApiKey() {
    const input = document.getElementById("gemini-api-key");
    if (input && input.value.trim()) {
        return input.value.trim();
    }
    return localStorage.getItem("VICO_GEMINI_API_KEY") || "";
}

function toggleKeyVisibility() {
    const input = document.getElementById("gemini-api-key");
    if (input) {
        input.type = input.type === "password" ? "text" : "password";
    }
}

function formatVND(val) {
    if (val === null || val === undefined || val === '') return null;
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return null;
    return new Intl.NumberFormat('vi-VN').format(num) + " VNĐ";
}

async function initApp() {
    try {
        const res = await fetch("/api/stats");
        if (res.ok) {
            isLocalServer = true;
            fetchStats();
            fetchDatabase(1);
            return;
        }
    } catch (e) {
        isLocalServer = false;
    }

    // Static GitHub Pages mode
    isLocalServer = false;
    await loadStaticJSONDatabase();
}

async function loadStaticJSONDatabase() {
    try {
        const res = await fetch("./kaizen_database.json?v=557.0");
        allKaizensCache = await res.json();
        
        // Fetch live updates from Google Sheet with 100% strict deduplication
        await fetchLiveGoogleSheetUpdates();

        updateUIStats();
        renderStaticTable(1);

    } catch (err) {
        console.error("Failed to load kaizen_database.json:", err);
    }
}

// RFC4180 Compliant CSV Parser for multi-line cells
function parseRFC4180CSV(text) {
    let rows = [];
    let row = [''];
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
        const c = text[i];
        const nextC = i + 1 < text.length ? text[i + 1] : '';

        if (c === '"') {
            if (inQuotes && nextC === '"') {
                row[row.length - 1] += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            row.push('');
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && nextC === '\n') i++;
            rows.push(row);
            row = [''];
        } else {
            row[row.length - 1] += c;
        }
        i++;
    }
    if (row.length > 1 || row[0] !== '') {
        rows.push(row);
    }
    return rows;
}

// Fetch live updates from Google Sheet directly in browser with 100% exact deduplication
async function fetchLiveGoogleSheetUpdates() {
    try {
        const res = await fetch(LIVE_GS_CSV_URL + "&_t=" + Date.now());
        if (!res.ok) return;

        const csvText = await res.text();
        const csvRows = parseRFC4180CSV(csvText);
        const parsedGS = parseGoogleSheetRows(csvRows);

        if (parsedGS && parsedGS.length > 0) {
            const existingTitles = new Set(allKaizensCache.map(k => (k.ten_y_tuong || '').toLowerCase().trim()));
            const existingCodes = new Set(allKaizensCache.map(k => k.ma_kaizen));
            let newAdded = 0;

            parsedGS.forEach(item => {
                const normTitle = (item.ten_y_tuong || '').toLowerCase().trim();
                if (normTitle && !existingTitles.has(normTitle) && !existingCodes.has(item.ma_kaizen)) {
                    allKaizensCache.unshift(item);
                    existingTitles.add(normTitle);
                    existingCodes.add(item.ma_kaizen);
                    newAdded++;
                }
            });

            if (newAdded > 0) {
                console.log(`[Google Sheet Live Sync] Added ${newAdded} brand new Kaizens in real-time!`);
            }
        }
    } catch (e) {
        console.warn("Live Google Sheet browser fetch note:", e);
    }
}

// Parse structured CSV rows
function parseGoogleSheetRows(csvRows) {
    const records = [];

    csvRows.forEach((row, idx) => {
        const rowText = row.filter(val => val && val.trim()).join('\n');
        if (!rowText.includes("💡 Tên ý tưởng:") && !rowText.includes("💡 Mã ý tưởng:")) return;

        const titleM = rowText.match(/💡 Tên ý tưởng:\s*(.*?)(?=\n💡|\n👤|\n🏢|\n📅|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n💰|\n🎁|\n📊|$)/s);
        const codeM = rowText.match(/💡 Mã ý tưởng:\s*(.*?)(?=\n👤|\n🏢|\n📅|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n💰|\n🎁|\n📊|$)/s);
        const authorM = rowText.match(/👤 Họ và tên tác giả:\s*(.*?)(?=\n🏢|\n📅|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n💰|\n🎁|\n📊|$)/s);
        const unitM = rowText.match(/🏢 Đơn vị:\s*(.*?)(?=\n📅|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n💰|\n🎁|\n📊|$)/s);
        const dateM = rowText.match(/📅 Ngày gửi:\s*(.*?)(?=\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n💰|\n🎁|\n📊|$)/s);

        const statusM = rowText.match(/⚠️ Hiện trạng và vấn đề:\s*(.*?)(?=\n🛠️|\n✨|\n💪|\n🚀|\n💰|\n🎁|\n📊|$)/s);
        const solM = rowText.match(/🛠️ Giải pháp:\s*(.*?)(?=\n✨|\n💪|\n🚀|\n💰|\n🎁|\n📊|$)/s);
        const benM = rowText.match(/✨ Tính lợi ích:\s*(.*?)(?=\n💪|\n🚀|\n💰|\n🎁|\n📊|$)/s);
        const resM = rowText.match(/💪 Nguồn lực thực hiện:\s*(.*?)(?=\n🚀|\n💰|\n🎁|\n📊|$)/s);

        const valM = rowText.match(/💰 Giá trị làm lợi:\s*([^\n\r]+)/);
        const rwM = rowText.match(/🎁 Tiền thưởng:\s*([^\n\r]+)/);
        
        const sysM = rowText.match(/📊 Trạng thái \(hệ thống\):\s*(.*?)(?=\n📊|\n💡|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\nGộp|$)/s);
        const tkM = rowText.match(/📊 Trạng thái triển khai \(TĐV\):\s*(.*?)(?=\n📊|\n💡|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\nGộp|$)/s);
        const dtM = rowText.match(/📊 Trạng thái duy trì\/mở rộng \(TĐV\):\s*(.*?)(?=\n📊|\n💡|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\nGộp|$)/s);

        const title = titleM ? titleM[1].trim() : '';
        const code = codeM ? codeM[1].trim() : `GS-LIVE-${idx}`;
        const author = authorM && authorM[1].trim() !== '*empty*' ? authorM[1].trim() : 'Google Sheet Trực Tuyến';
        const unit = unitM && unitM[1].trim() !== '*empty*' ? unitM[1].trim() : 'Hệ thống mới';
        const sentDate = dateM && dateM[1].trim() !== '*empty*' ? dateM[1].trim() : '';

        const statusQuo = statusM ? statusM[1].trim() : '';
        const solution = solM ? solM[1].trim() : '';
        const benefits = benM ? benM[1].trim() : '';
        const resources = resM ? resM[1].trim() : '';

        const valStr = valM ? valM[1].trim() : '';
        const rwStr = rwM ? rwM[1].trim() : '';
        const valNum = valStr.replace(/[^\d]/g, '');
        const rwNum = rwStr.replace(/[^\d]/g, '');
        const giaTriLamLoiVnd = valNum ? parseFloat(valNum) : null;
        const tienThuongVnd = rwNum ? parseFloat(rwNum) : null;

        const status = sysM && sysM[1].trim() !== '*empty*' ? sysM[1].trim() : 'Đề nghị mới';
        const tkStatus = tkM && tkM[1].trim() !== '*empty*' ? tkM[1].trim() : '';
        const dtStatus = dtM && dtM[1].trim() !== '*empty*' ? dtM[1].trim() : '';

        if (title) {
            records.push({
                ma_kaizen: code,
                nam: 2026,
                ten_y_tuong: title,
                don_vi: unit,
                nguoi_de_xuat: author,
                ngay_gui: sentDate,
                thuc_trang: statusQuo,
                giai_phap: solution,
                danh_gia_hieu_qua: benefits,
                nguon_luc: resources,
                gia_tri_lam_loi_vnd: giaTriLamLoiVnd,
                tien_thuong_vnd: tienThuongVnd,
                tinh_trang_khen_thuong: tienThuongVnd ? 'Đã khen thưởng' : '',
                trang_thai: status,
                trang_thai_trien_khai: tkStatus,
                trang_thai_duy_tri: dtStatus,
                phan_loai: 'Live Google Sheet'
            });
        }
    });

    return records;
}

function updateUIStats() {
    setElementText("stat-total", allKaizensCache.length);
    setElementText("stat-total-count", allKaizensCache.length);

    let a3Count = 0;
    const statusCounts = {};

    allKaizensCache.forEach(k => {
        const st = k.trang_thai || 'Báo cáo mới';
        statusCounts[st] = (statusCounts[st] || 0) + 1;

        if (st.includes("A3") || st.includes("hoàn thành") || st.includes("Đã triển khai") || st.includes("Duy trì")) {
            a3Count++;
        }
    });

    const statusSelect = document.getElementById("db-filter-status");
    if (statusSelect) {
        statusSelect.innerHTML = '<option value="">Tất cả Trạng thái</option>';
        Object.keys(statusCounts).forEach(st => {
            const opt = document.createElement("option");
            opt.value = st;
            opt.textContent = st;
            statusSelect.appendChild(opt);
        });
    }
}

// Tab Switcher
function switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));

    const targetContent = document.getElementById(tabId);
    if (targetContent) {
        targetContent.classList.add("active");
    }

    if (tabId === "evaluator-tab") {
        document.querySelectorAll(".tab-btn")[0]?.classList.add("active");
    } else if (tabId === "database-tab") {
        document.querySelectorAll(".tab-btn")[1]?.classList.add("active");
    } else if (tabId === "guide-tab") {
        document.querySelectorAll(".tab-btn")[2]?.classList.add("active");
    }
}

// Load Quick Samples
function loadSample(type) {
    const textarea = document.getElementById("input-content");
    if (type === 1) {
        textarea.value = `💡 Tên ý tưởng: Gia công nắp che tôn bảo vệ máng điện cẩu trục xoay
💡 Mã ý tưởng: KZ-TEST-001
⚠️ Hiện trạng và vấn đề: Khi cẩu trục xoay vận hành trong phân xưởng Đúc, máng điện thường xuyên bị va chạm dẫn đến rách hỏng máng điện, chập cháy điện gây mất an toàn và dừng máy sửa chữa.
🛠️ Giải pháp: Thiết kế và lắp đặt thanh chắn sắt bảo vệ cố định dọc hành trình cẩu trục xoay để ngăn va chạm trực tiếp với máng điện.
✨ Tính lợi ích: Triệt tiêu 100% rủi ro va chạm rách máng điện, tăng an toàn lao động và tiết kiệm chi phí sửa chữa.
💪 Nguồn lực: Tận dụng sắt phế liệu sẵn có trong phân xưởng + 2h công thợ.`;
    } else if (type === 2) {
        textarea.value = `💡 Tên ý tưởng: Chế tạo máy mài tự động lưỡi cưa đĩa và lưỡi cưa vòng
⚠️ Hiện trạng và vấn đề: Việc mài răng cưa lưỡi cưa hiện nay công nhân thực hiện hoàn toàn bằng tay, thời gian mài lâu, rủi ro mất an toàn trượt tay đứt tay và các răng mài không đồng đều.
🛠️ Giải pháp: Thiết kế và chế tạo đồ gá kết hợp motor mài răng cưa tự động giúp mài chính xác và an toàn.
✨ Tính lợi ích: Tăng tuổi thọ lưỡi cưa lên 4-5 lần tái sử dụng, tiết kiệm chi phí mua lưỡi mới.`;
    } else if (type === 3) {
        textarea.value = `💡 Tên ý tưởng: Ứng dụng hệ thống thị giác máy tính AI tự động quét khuyết tật bề mặt sản phẩm đúc trên băng tải
⚠️ Hiện trạng và vấn đề: Công tác kiểm tra lỗi rỗ khí, nứt bề mặt sản phẩm đúc tại khu vực QC thực hiện bằng mắt thường dễ gây bỏ sót phế phẩm giao cho khách hàng.
🛠️ Giải pháp: Lắp đặt Camera IP độ phân giải cao kết hợp mô hình AI Deep Learning YOLO để phát hiện và cảnh báo tự động sản phẩm lỗi trên băng tải chuyền.
✨ Tính lợi ích: Nâng cao độ chính xác kiểm tra lên 99.8%, tự động hóa công đoạn kiểm tra QC.`;
    }
}

// Fetch Global Stats (Local Server)
async function fetchStats() {
    try {
        const res = await fetch("/api/stats");
        const data = await res.json();

        setElementText("stat-total", data.total_kaizens || 556);
        setElementText("stat-total-count", data.total_kaizens || 556);

        const statusSelect = document.getElementById("db-filter-status");
        if (statusSelect) {
            statusSelect.innerHTML = '<option value="">Tất cả Trạng thái</option>';
            for (const [stName, _] of Object.entries(data.status_counts || {})) {
                if (stName && stName !== "None") {
                    const opt = document.createElement("option");
                    opt.value = stName;
                    opt.textContent = stName;
                    statusSelect.appendChild(opt);
                }
            }
        }
    } catch (err) {}
}

function showLoading(title, desc) {
    const emptyElem = document.getElementById("empty-state");
    if (emptyElem) emptyElem.classList.add("hidden");
    const resElem = document.getElementById("eval-result");
    if (resElem) resElem.classList.add("hidden");
    
    const loadElem = document.getElementById("loading-state");
    if (loadElem) loadElem.classList.remove("hidden");

    setElementText("loading-title", title || "AI Đang Phân Tích & Đối Chiếu Toàn Bộ Hệ Thống...");
    setElementText("loading-desc", desc || "Đang so sánh ngữ nghĩa với các đề tài cải tiến trong CSDL VICO");
}

function hideLoading() {
    const loadElem = document.getElementById("loading-state");
    if (loadElem) loadElem.classList.add("hidden");
}

// Handle Fast Vector AI Evaluation Submit
async function handleEvaluate(e) {
    if (e) e.preventDefault();

    const contentText = document.getElementById("input-content").value.trim();
    const topK = parseInt(document.getElementById("input-topk").value);

    if (!contentText) {
        alert("Vui lòng nhập nội dung ý tưởng cải tiến!");
        return;
    }

    showLoading(
        "⚡ Vector AI đang phân tích ma trận véc-tơ siêu tốc (0.01s)...",
        "Đang so sánh trọng số N-gram với toàn bộ cơ sở dữ liệu VICO"
    );

    try {
        if (isLocalServer) {
            const res = await fetch("/api/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: contentText, top_k: topK })
            });
            const data = await res.json();
            renderEvaluationResult(data, contentText);
        } else {
            const data = evaluateClientSide(contentText, topK);
            renderEvaluationResult(data, contentText);
        }
    } catch (err) {
        console.error("Evaluation error:", err);
        const data = evaluateClientSide(contentText, topK);
        renderEvaluationResult(data, contentText);
    } finally {
        hideLoading();
    }
}

// Handle Deep Gemini LLM Evaluation
async function handleGeminiEvaluate(e) {
    if (e) e.preventDefault();

    const textarea = document.getElementById("input-content");
    const contentText = textarea ? textarea.value.trim() : "";
    if (!contentText) {
        alert("Vui lòng nhập hoặc dán nội dung đề tài cải tiến cần đánh giá!");
        return;
    }

    const topKSelect = document.getElementById("input-topk");
    const topK = topKSelect ? parseInt(topKSelect.value) : 5;

    showLoading(
        "🧠 Gemini AI đang phân tích ngữ nghĩa & suy luận chi tiết...",
        "Đang đối chiếu sâu về bản chất kỹ thuật, thực trạng và giải pháp với kho Kaizen VICO"
    );

    // Prioritize Server-side endpoint reading from .env file
    if (isLocalServer) {
        try {
            const res = await fetch("/api/evaluate_gemini", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: contentText, top_k: topK })
            });
            if (res.ok) {
                const data = await res.json();
                hideLoading();
                renderEvaluationResult(data, contentText);
                return;
            } else {
                const errData = await res.json();
                throw new Error(errData.error || `Lỗi HTTP ${res.status}`);
            }
        } catch (sErr) {
            console.warn("Server-side Gemini evaluation error:", sErr.message);
        }
    }

    // Client-side fallback if client API key is provided
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        hideLoading();
        alert("Để đánh giá bằng Gemini LLM API, vui lòng chạy web server địa phương có file .env chứa GEMINI_API_KEY hoặc nhập API Key!");
        handleEvaluate(e);
        return;
    }

    try {
        // Step 1: Pre-filter candidate Kaizens using Vector engine
        const vectorResult = evaluateClientSide(contentText, topK);
        const candidates = vectorResult.matched_kaizens || [];

        // Step 2: Format prompt for Gemini LLM
        let candText = "";
        candidates.forEach((c, idx) => {
            candText += `\n${idx+1}. Mã Kaizen: [${c.ma_kaizen}] | Năm: ${c.nam} | Tác giả: ${c.nguoi_de_xuat} (${c.don_vi || 'VICO'})\n   Tên ý tưởng: ${c.ten_y_tuong}\n   Thực trạng: ${c.thuc_trang || 'N/A'}\n   Giải pháp: ${c.giai_phap || 'N/A'}\n   Thưởng gốc: ${c.tien_thuong_vnd ? formatVND(c.tien_thuong_vnd) : 'Theo quy chế VICO'}\n`;
        });

        const promptText = `Bạn là Chuyên gia Cao cấp Đánh giá Cải tiến (Senior Kaizen Specialist) của Công ty VICO.
Nhiệm vụ của bạn là đọc hiểu bản chất kỹ thuật, thực trạng và giải pháp của đề tài mới, sau đó đối chiếu ngữ nghĩa sâu với danh sách các đề tài đã có trong CSDL VICO bên dưới.

NỘI DUNG ĐỀ TÀI CẢI TIẾN MỚI CẦN ĐÁNH GIÁ:
"""
${contentText}
"""

DANH SÁCH ${candidates.length} ĐỀ TÀI LỊCH SỬ CÓ KHẢ NĂNG TƯƠNG ĐỒNG CAO NHẤT TRONG CSDL VICO:
${candText}

QUY TẮC ĐÁNH GIÁ & KHEN THƯỞNG CỦA VICO:
1. Trùng lặp hoàn toàn (>= 70%): Phân loại "🔴 TRÙNG LẮP HOÀN TOÀN" (Mức thưởng: 0 VNĐ - Bác bỏ).
2. Giải pháp mở rộng/nhân rộng (35% - 69%): Phân loại "🟡 GIẢI PHÁP MỞ RỘNG / TƯƠNG TỰ (THƯỞNG 50%)" (Mức thưởng = 50% mức thưởng gốc).
3. Ý tưởng mới độc lập (< 35%): Phân loại "🟢 Ý TƯỞNG MỚI ĐỘC LẬP (THƯỞNG 100%)".

YÊU CẦU TRẢ VỀ:
Hãy trả về DUY NHẤT một chuỗi JSON hợp lệ (không kèm Markdown code block hay text thừa) theo đúng cấu trúc:
{
  "max_similarity_pct": 45.0,
  "risk_level": "🟡 GIẢI PHÁP MỞ RỘNG / TƯƠNG TỰ (THƯỞNG 50%)",
  "risk_code": "EXPANDED_SOLUTION",
  "reward_policy": "Viết kết luận tổng quan ngắn gọn, tính mức thưởng 50% cụ thể nếu đề tài gốc có tiền thưởng.",
  "matched_analysis": [
     {
        "ma_kaizen": "Mã Kaizen",
        "similarity_pct": 45.0,
        "reasoning": "Viết 1-2 câu nhận xét ngắn gọn điểm giống và khác về kỹ thuật."
     }
  ]
}`;

        // Step 3: Call Gemini REST API with automatic model fallback array
        const GEMINI_MODELS = [
            "gemini-3.6-flash",
            "gemini-3.5-flash",
            "gemini-flash-latest",
            "gemini-2.5-flash"
        ];

        let geminiJson = null;
        let lastErrorMsg = "";
        let usedModel = "";

        for (const modelName of GEMINI_MODELS) {
            try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
                const res = await fetch(geminiUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: promptText }] }]
                    })
                });

                if (res.ok) {
                    geminiJson = await res.json();
                    usedModel = modelName;
                    break;
                } else {
                    const errData = await res.json();
                    lastErrorMsg = errData.error?.message || `HTTP ${res.status}`;
                }
            } catch (mErr) {
                lastErrorMsg = mErr.message;
            }
        }

        if (!geminiJson) {
            throw new Error(lastErrorMsg || "Tất cả các model Gemini API đều không khả dụng.");
        }

        const rawText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Step 4: Parse LLM JSON
        let cleanedJson = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
        let parsedResult = null;
        try {
            parsedResult = JSON.parse(cleanedJson);
        } catch (pErr) {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedResult = JSON.parse(jsonMatch[0]);
            }
        }

        if (!parsedResult) {
            throw new Error("Không thể parse phản hồi từ Gemini API.");
        }

        // Merge matched reasoning with candidates
        const mergedMatches = candidates.map(c => {
            const llmItem = (parsedResult.matched_analysis || []).find(m => m.ma_kaizen === c.ma_kaizen);
            return {
                ...c,
                overall_similarity_pct: llmItem && llmItem.similarity_pct ? llmItem.similarity_pct : c.overall_similarity_pct,
                llm_reasoning: llmItem ? llmItem.reasoning : null
            };
        });

        const finalData = {
            max_similarity_pct: parsedResult.max_similarity_pct || vectorResult.max_similarity_pct,
            risk_level: parsedResult.risk_level || vectorResult.risk_level,
            risk_code: parsedResult.risk_code || vectorResult.risk_code,
            reward_policy: `🧠 [KẾT QUẢ ĐÁNH GIÁ CHUYÊN SÂU BỞI GEMINI AI (${usedModel || 'LLM'})]\n\n` + parsedResult.reward_policy,
            matched_kaizens: mergedMatches
        };

        hideLoading();
        renderEvaluationResult(finalData, contentText);

    } catch (err) {
        hideLoading();
        alert("Lỗi khi kết nối Gemini API: " + err.message + "\n\nHệ thống sẽ tự động chuyển sang chế độ Đánh Giá Nhanh bằng Vector AI.");
        handleEvaluate(e);
    }
}

// 🎯 AI Kaizen Evaluation & Coaching Agent Handler
async function handleKaizenCoaching(e) {
    if (e) e.preventDefault();

    const contentText = (document.getElementById("input-content")?.value || "").trim();
    if (!contentText) {
        alert("Vui lòng nhập nội dung đề tài cải tiến trước khi bấm Thẩm Định & Cố Vấn.");
        return;
    }

    showLoading("🎯 AI Kaizen Coach đang thẩm định bản chất ý tưởng, chấm điểm Kaizen Fit & viết lại bài chuẩn hóa...");

    // 1. Try local server endpoint if on local server
    if (isLocalServer) {
        try {
            const response = await fetch("/api/evaluate_kaizen_coaching", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: contentText })
            });

            const contentType = response.headers.get("content-type") || "";
            if (response.ok && contentType.includes("application/json")) {
                const coachingData = await response.json();
                hideLoading();
                renderCoachingResult(coachingData);
                return;
            }
        } catch (sErr) {
            console.warn("Server-side coaching error:", sErr.message);
        }
    }

    // 2. Client-side fallback (for GitHub Pages static host or missing server)
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        hideLoading();
        alert("Hệ thống đang chạy trên giao diện GitHub Pages. Để sử dụng AI Kaizen Coach, vui lòng nhập API Key hoặc chạy Web Server địa phương có file .env!");
        return;
    }

    try {
        const coachingPrompt = `Bạn là **AI Kaizen Evaluation & Coaching Agent** chính thức của Công ty VICO.
Nhiệm vụ của bạn là thẩm định bản chất của đề tài cải tiến nộp vào, chấm điểm định lượng Kaizen Fit & Idea Maturity, phát hiện lãng phí (Muda), tìm lỗ hổng thông tin còn thiếu, đưa ra câu hỏi hướng dẫn và **viết lại bài Kaizen theo mẫu chuẩn hóa của VICO**.

NỘI DUNG Ý TƯỞNG CẦN THẨM ĐỊNH & CỐ VẤN:
"""
${contentText}
"""

NGUYÊN TẮC CỐT LÕI & PHÂN LOẠI (CLASSIFICATION):
1. KAIZEN: Có bản chất cải tiến rõ ràng (Hiện trạng -> Vấn đề -> Thay đổi -> Trạng thái tốt hơn).
2. KAIZEN_NEEDS_REFINEMENT: Có bản chất Kaizen nhưng cần bổ sung thông tin trước khi triển khai.
3. KAIZEN_CANDIDATE_NEED_INFO: Có dấu hiệu Kaizen nhưng thông tin quá sơ khai.
4. PROBLEM_ONLY: Mới chỉ nêu phản ánh vấn đề/khó khăn, chưa đưa ra giải pháp/thay đổi nào.
5. TARGET_ONLY: Mới chỉ nêu mục tiêu (VD: "Cần giảm 20% điện") chưa có giải pháp.
6. MAINTENANCE_REPAIR: Chỉ là sửa chữa/thay thế khôi phục thiết bị về trạng thái ban đầu, KHÔNG PHẢI KAIZEN.
7. COMPLIANCE_ACTION: Chỉ thực hiện theo đúng luật/SOP bắt buộc, chưa phải cải tiến phương pháp.
8. IMPROVEMENT_PROJECT: Là dự án chuyển đổi quy mô lớn/Kaikaku.
9. NOT_RECOMMENDED_RISK: Tạo ra rủi ro an toàn/pháp lý/chất lượng nghiêm trọng không chấp nhận được.
10. NOT_IMPROVEMENT: Không có yếu tố cải tiến.

THỨ TỰ ƯU TIÊN AN TOÀN: SAFETY -> LEGAL/COMPLIANCE -> QUALITY -> OPERATION -> COST.

YÊU CẦU TRẢ VỀ:
Hãy trả về DUY NHẤT một chuỗi JSON hợp lệ (không kèm Markdown code block hay text giải thích bên ngoài) theo cấu trúc:
{
  "classification": "KAIZEN",
  "classification_display": "🟢 Ý TƯỞNG KAIZEN CHUẨN",
  "classification_reason": "Mô tả ngắn gọn lý do phân loại trong 1-2 câu.",
  "kaizen_fit": {
    "score": 85,
    "level": "STRONG_KAIZEN",
    "components": {
      "problem_waste": 18,
      "concrete_change": 18,
      "testability": 12,
      "measurable_improvement": 12,
      "process_relevance": 13,
      "sustainability": 12
    }
  },
  "idea_maturity": {
    "score": 65,
    "level": "DEVELOPING",
    "components": {
      "problem_definition": 12,
      "baseline_data": 5,
      "root_cause": 10,
      "solution_alignment": 12,
      "expected_benefit": 10,
      "feasibility": 8,
      "risk_analysis": 4,
      "pilot_standardization": 4
    }
  },
  "confidence": {
    "level": "HIGH",
    "coverage_percent": 80
  },
  "waste_categories": ["waiting", "motion", "safety_risk"],
  "causal_logic": {
    "status": "PLAUSIBLE",
    "explanation": "Giải thích mối quan hệ nguyên nhân - giải pháp ngắn gọn."
  },
  "missing_information": [
    "Thời gian thực hiện thao tác hiện tại",
    "Tần suất xảy ra sự cố"
  ],
  "top_questions": [
    "Thao tác hiện tại đang mất bao nhiêu phút mỗi lần thực hiện?",
    "Một tháng trung bình có bao nhiêu lần xảy ra sự cố này?"
  ],
  "improvement_recommendations": [
    "Nên thử nghiệm trước tại 01 máy hoặc 1 ca làm việc.",
    "Bổ sung chỉ số đo lường cụ thể để minh chứng hiệu quả."
  ],
  "pilot": {
    "recommended": true,
    "minimum_testable_kaizen": "Thử nghiệm giải pháp trên phạm vi nhỏ nhất.",
    "scope": "Phân xưởng / Bộ phận thử nghiệm",
    "measurement": "Chỉ số đo lường kết quả",
    "success_criteria": "Tiêu chuẩn đánh giá thành công"
  },
  "rewritten_kaizen_statement": "Hiện tại [Quy trình] đang [Vấn đề/Hiện trạng]... Đề xuất thay đổi [Phương pháp cũ] thành [Phương pháp mới] nhằm cải thiện [KPI]. Trước tiên thử nghiệm tại [Phạm vi pilot] trong [Thời gian]. Thành công khi [Tiêu chuẩn]. Nguồn lực cần thiết...",
  "final_message": "Lời khuyên tổng quan dành cho tác giả nộp bài."
}`;

        const GEMINI_MODELS = [
            "gemini-3.6-flash",
            "gemini-3.5-flash",
            "gemini-flash-latest",
            "gemini-2.5-flash"
        ];

        let geminiJson = null;
        let lastErrorMsg = "";
        let usedModel = "";

        for (const modelName of GEMINI_MODELS) {
            try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
                const res = await fetch(geminiUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: coachingPrompt }] }]
                    })
                });

                if (res.ok) {
                    geminiJson = await res.json();
                    usedModel = modelName;
                    break;
                } else {
                    const errData = await res.json();
                    lastErrorMsg = errData.error?.message || `HTTP ${res.status}`;
                }
            } catch (mErr) {
                lastErrorMsg = mErr.message;
            }
        }

        if (!geminiJson) {
            throw new Error(lastErrorMsg || "Không thể kết nối Gemini API.");
        }

        const rawText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
        let cleanedJson = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
        let parsedResult = null;
        try {
            parsedResult = JSON.parse(cleanedJson);
        } catch (pErr) {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedResult = JSON.parse(jsonMatch[0]);
            }
        }

        if (!parsedResult) {
            throw new Error("Không thể parse kết quả JSON từ AI Coach.");
        }

        parsedResult.used_model = usedModel;
        hideLoading();
        renderCoachingResult(parsedResult);

    } catch (err) {
        hideLoading();
        alert("Lỗi khi kết nối AI Kaizen Coach: " + err.message);
    }
}

// Render AI Kaizen Coaching Results
function renderCoachingResult(data) {
    const parentContainer = document.getElementById("result-container");
    if (!parentContainer) return;

    // Hide empty state, loading state, and duplicate result container
    const emptyElem = document.getElementById("empty-state");
    if (emptyElem) emptyElem.classList.add("hidden");
    const loadElem = document.getElementById("loading-state");
    if (loadElem) loadElem.classList.add("hidden");
    const evalResElem = document.getElementById("eval-result");
    if (evalResElem) evalResElem.classList.add("hidden");

    let coachingContainer = document.getElementById("coaching-result-wrapper");
    if (!coachingContainer) {
        coachingContainer = document.createElement("div");
        coachingContainer.id = "coaching-result-wrapper";
        parentContainer.appendChild(coachingContainer);
    }
    coachingContainer.classList.remove("hidden");
    coachingContainer.scrollIntoView({ behavior: "smooth", block: "start" });

    // Classification Badge styling
    let badgeClass = "badge-info";
    const cls = data.classification || "";
    if (cls === "KAIZEN") badgeClass = "badge-kaizen";
    else if (cls.includes("REFINEMENT") || cls.includes("INFO") || cls.includes("PROBLEM") || cls.includes("TARGET")) badgeClass = "badge-refinement";
    else if (cls.includes("REPAIR") || cls.includes("COMPLIANCE") || cls.includes("RISK") || cls.includes("NOT")) badgeClass = "badge-repair";

    const fitScore = data.kaizen_fit ? (data.kaizen_fit.score || 0) : 0;
    const maturityScore = data.idea_maturity ? (data.idea_maturity.score || 0) : 0;

    let questionsHtml = "";
    if (data.top_questions && data.top_questions.length > 0) {
        questionsHtml = data.top_questions.map(q => `<li><i class="fa-solid fa-circle-question" style="color: #fbbf24;"></i> ${q}</li>`).join("");
    } else {
        questionsHtml = "<li>Ý tưởng đã có đầy đủ thông tin cốt lõi!</li>";
    }

    let recsHtml = "";
    if (data.improvement_recommendations && data.improvement_recommendations.length > 0) {
        recsHtml = data.improvement_recommendations.map(r => `<li><i class="fa-solid fa-lightbulb" style="color: #60a5fa;"></i> ${r}</li>`).join("");
    }

    let wasteHtml = "";
    if (data.waste_categories && data.waste_categories.length > 0) {
        wasteHtml = `<p style="font-size: 12px; color: #94a3b8; margin-top: 8px;"><strong>Lãng phí (Muda) được nhận diện:</strong> ${data.waste_categories.map(w => `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171; font-size: 11px; margin-right: 4px;">${w}</span>`).join(" ")}</p>`;
    }

    let pilotHtml = "";
    if (data.pilot) {
        pilotHtml = `
        <div class="pilot-box">
            <i class="fa-solid fa-vial"></i> <strong>Đề Xuất Thử Nghiệm Thu Nhỏ (Pilot Scope):</strong> ${data.pilot.minimum_testable_kaizen || 'Thử nghiệm trên 1 khu vực nhỏ'}<br>
            • <strong>Phạm vi:</strong> ${data.pilot.scope || 'Phân xưởng/Bộ phận'}<br>
            • <strong>Chỉ số đo lường (KPI):</strong> ${data.pilot.measurement || 'Thời gian/Lỗi'}<br>
            • <strong>Tiêu chuẩn thành công:</strong> ${data.pilot.success_criteria || 'Không phát sinh sự cố'}
        </div>`;
    }

    const html = `
    <div class="coaching-card">
        <div class="coaching-header">
            <div class="coaching-title-box">
                <h3><i class="fa-solid fa-bullseye"></i> THẨM ĐỊNH & CỐ VẤN KAIZEN (AI COACH)</h3>
                <p>Mô hình AI: Google Gemini (${data.used_model || '3.6-flash'})</p>
            </div>
            <div class="coaching-badge ${badgeClass}">
                <i class="fa-solid fa-award"></i> ${data.classification_display || data.classification || 'KAIZEN'}
            </div>
        </div>

        <p style="font-size: 13px; color: #cbd5e1; line-height: 1.5; margin-bottom: 16px;">
            <strong>Nhận xét bản chất:</strong> ${data.classification_reason || 'Đề tài có tiềm năng cải tiến.'}
        </p>

        <!-- Scores Grid -->
        <div class="scores-grid">
            <div class="score-box">
                <div class="score-lbl">
                    <span><i class="fa-solid fa-chart-pie" style="color: #3b82f6;"></i> Kaizen Fit Score (Bản chất):</span>
                    <span class="score-val">${fitScore}/100</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill fill-fit" style="width: ${fitScore}%;"></div>
                </div>
                <div class="score-desc">Mức độ phù hợp với tinh thần Kaizen: <strong>${data.kaizen_fit?.level || 'STRONG_KAIZEN'}</strong></div>
            </div>

            <div class="score-box">
                <div class="score-lbl">
                    <span><i class="fa-solid fa-sliders" style="color: #8b5cf6;"></i> Idea Maturity Score (Độ hoàn thiện):</span>
                    <span class="score-val">${maturityScore}/100</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill fill-maturity" style="width: ${maturityScore}%;"></div>
                </div>
                <div class="score-desc">Trạng thái phát triển ý tưởng: <strong>${data.idea_maturity?.level || 'DEVELOPING'}</strong></div>
            </div>
        </div>

        <!-- Rewritten Standardized Kaizen Statement -->
        <div class="rewritten-section">
            <div class="rewritten-header">
                <h4><i class="fa-solid fa-wand-magic-sparkles"></i> PHIÊN BẢN KAIZEN ĐÃ ĐƯỢC AI VIẾT LẠI CHUẨN HÓA</h4>
                <button type="button" class="btn-copy-rewritten" onclick="copyRewrittenStatement()">
                    <i class="fa-solid fa-copy"></i> 📋 Sao Chép Bài Viết Lại
                </button>
            </div>
            <div class="rewritten-content" id="rewritten-statement-text">${data.rewritten_kaizen_statement || 'Đang cập nhật phiên bản viết lại...'}</div>
        </div>

        <!-- Details Grid -->
        <div class="coaching-details-grid">
            <div class="detail-block">
                <h4><i class="fa-solid fa-circle-question" style="color: #fbbf24;"></i> 3-5 CÂU HỎI HƯỚNG DẪN BỔ SUNG</h4>
                <ul>${questionsHtml}</ul>
            </div>

            <div class="detail-block">
                <h4><i class="fa-solid fa-lightbulb" style="color: #60a5fa;"></i> GỢI Ý NÂNG CẤP & HOÀN THIỆN</h4>
                <ul>${recsHtml}</ul>
                ${wasteHtml}
            </div>
        </div>

        ${pilotHtml}

        <div style="margin-top: 16px; font-size: 12px; color: #94a3b8; border-top: 1px solid var(--border-color); padding-top: 12px;">
            💬 <strong>Lời khuyên của AI Coach:</strong> ${data.final_message || 'Hãy hoàn thiện thêm các thông tin còn thiếu và thử nghiệm thu nhỏ trước khi đăng ký chính thức.'}
        </div>
    </div>

    <!-- Interactive AI Kaizen Coach Chatbot Card -->
    <div class="chat-card" id="ai-coach-chat-card">
        <div class="chat-card-header">
            <h4><i class="fa-solid fa-comments"></i> TRÒ CHUYỆN & CỐ VẤN TƯƠNG TÁC 2 CHIỀU VỚI AI COACH</h4>
            <span style="font-size: 11px; color: #94a3b8;">Nhắn tin trực tiếp với AI Coach để hoàn thiện đề tài</span>
        </div>

        <div class="chat-messages-container" id="chat-messages-container">
            <!-- Messages populated dynamically -->
        </div>

        <!-- Quick Action Pills -->
        <div class="chat-quick-pills">
            <button type="button" class="quick-pill" onclick="sendQuickPill('📋 Hãy viết lại đề tài này theo đúng cấu trúc chuẩn hóa của VICO')">📋 Viết lại chuẩn VICO</button>
            <button type="button" class="quick-pill" onclick="sendQuickPill('📊 Đánh giá lại điểm Kaizen Fit và Idea Maturity cho bài viết của tôi')">📊 Điểm Kaizen Fit?</button>
            <button type="button" class="quick-pill" onclick="sendQuickPill('💡 Đề xuất cho tôi các chỉ số KPI cụ thể để đo lường hiệu quả bài này')">💡 Gợi ý KPI đo lường</button>
            <button type="button" class="quick-pill" onclick="sendQuickPill('❓ Hướng dẫn tôi cách lập kế hoạch thử nghiệm thu nhỏ (Pilot)')">❓ Hướng dẫn thử nghiệm Pilot</button>
        </div>

        <!-- Input Bar -->
        <div class="chat-input-row">
            <input type="text" class="chat-input" id="chat-user-input" placeholder="Gõ câu trả lời hoặc câu hỏi cho AI Coach (Ví dụ: Thao tác này mất 20 phút mỗi ngày)..." onkeypress="if(event.key==='Enter') sendChatMessage()">
            <button type="button" class="chat-send-btn" onclick="sendChatMessage()"><i class="fa-solid fa-paper-plane"></i> Gửi</button>
        </div>
    </div>`;

    coachingContainer.innerHTML = html;

    // Initialize Chat History
    coachingChatHistory = [
        {
            role: "model",
            parts: [{ text: `Chào bạn! Tôi là **AI Kaizen Coach** của VICO.\n\n${data.final_message || 'Tôi vừa thẩm định sơ bộ ý tưởng của bạn.'}\n\nBạn có thể trả lời các câu hỏi bổ sung của tôi hoặc gõ thắc mắc/chọn các phản hồi nhanh bên dưới để cùng tôi hoàn thiện đề tài nhé!` }]
        }
    ];
    renderChatMessages();
}

// Global Chatbot State & Handlers
let coachingChatHistory = [];

function renderChatMessages() {
    const container = document.getElementById("chat-messages-container");
    if (!container) return;

    let html = "";
    coachingChatHistory.forEach(msg => {
        const isUser = msg.role === "user";
        const bubbleClass = isUser ? "user-bubble" : "ai-bubble";
        const wrapperClass = isUser ? "user-msg" : "ai-msg";
        const text = msg.parts[0]?.text || "";
        const formattedText = text.replace(/\n/g, "<br>");

        html += `
        <div class="chat-msg ${wrapperClass}">
            <div class="msg-bubble ${bubbleClass}">
                ${isUser ? '<strong>Bạn:</strong> ' : '<strong><i class="fa-solid fa-robot" style="color: #fbbf24;"></i> AI Coach:</strong><br>'}${formattedText}
            </div>
        </div>`;
    });

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

function appendChatMessage(role, text) {
    coachingChatHistory.push({ role: role, parts: [{ text: text }] });
    renderChatMessages();
}

function showChatTyping() {
    const container = document.getElementById("chat-messages-container");
    if (!container) return;
    const typingDiv = document.createElement("div");
    typingDiv.id = "chat-typing-indicator";
    typingDiv.className = "chat-msg ai-msg";
    typingDiv.innerHTML = `<div class="msg-bubble ai-bubble" style="color: #fbbf24;"><i class="fa-solid fa-spinner fa-spin"></i> AI Coach đang suy nghĩ và gõ câu trả lời...</div>`;
    container.appendChild(typingDiv);
    container.scrollTop = container.scrollHeight;
}

function removeChatTyping() {
    const typingDiv = document.getElementById("chat-typing-indicator");
    if (typingDiv) typingDiv.remove();
}

function sendQuickPill(pillText) {
    sendChatMessage(pillText);
}

async function sendChatMessage(customText) {
    const inputEl = document.getElementById("chat-user-input");
    const text = customText ? customText.trim() : (inputEl ? inputEl.value.trim() : "");
    if (!text) return;

    if (inputEl && !customText) inputEl.value = "";

    // Append User Message
    appendChatMessage("user", text);
    showChatTyping();

    // Format payload for multi-turn chat
    const messagesPayload = coachingChatHistory.map(m => ({
        role: m.role,
        content: m.parts[0]?.text || ""
    }));

    try {
        let replyText = "";
        let usedModel = "";

        // 1. Try local server endpoint if on local server
        if (isLocalServer) {
            try {
                const res = await fetch("/api/chat_coaching", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ messages: messagesPayload })
                });

                const contentType = res.headers.get("content-type") || "";
                if (res.ok && contentType.includes("application/json")) {
                    const data = await res.json();
                    replyText = data.reply;
                    usedModel = data.used_model;
                }
            } catch (sErr) {
                console.warn("Server chat coaching error:", sErr);
            }
        }

        // 2. Client-side fallback for GitHub Pages
        if (!replyText) {
            const apiKey = getGeminiApiKey();
            if (!apiKey) {
                removeChatTyping();
                alert("Vui lòng nhập API Key để tiếp tục trò chuyện với AI Coach trên GitHub Pages.");
                return;
            }

            const GEMINI_MODELS = [
                "gemini-3.6-flash",
                "gemini-3.5-flash",
                "gemini-flash-latest",
                "gemini-2.5-flash"
            ];

            const systemInstruction = `Bạn là **AI Kaizen Evaluation & Coaching Agent** chính thức của Công ty VICO.
Nhiệm vụ của bạn là trò chuyện tương tác 2 chiều với Cán bộ công nhân viên (CBCNV) VICO để:
1. Đánh giá bản chất ý tưởng (Có phải Kaizen hay là Sửa chữa/Bảo trì/Tuân thủ?).
2. Hướng dẫn tác giả bổ sung các thông tin còn thiếu (Hiện trạng, Baseline, KPI, Tần suất lỗi).
3. Cố vấn thu nhỏ phạm vi thử nghiệm (Pilot) & đề xuất chỉ số đo lường.
4. Giúp tác giả **viết lại đề tài Kaizen theo cấu trúc chuẩn hóa VICO** khi tác giả yêu cầu hoặc khi thông tin đã đủ.

PHONG CÁCH TRÒ CHUYỆN: Lịch sự, chuyên nghiệp, khuyến khích sáng tạo, súc tích và có trọng tâm. Dùng định dạng Markdown rõ ràng.`;

            const contentsPayload = coachingChatHistory.map(m => ({
                role: m.role,
                parts: m.parts
            }));

            for (const modelName of GEMINI_MODELS) {
                try {
                    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
                    const res = await fetch(geminiUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            systemInstruction: { parts: [{ text: systemInstruction }] },
                            contents: contentsPayload
                        })
                    });

                    if (res.ok) {
                        const geminiJson = await res.json();
                        replyText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
                        usedModel = modelName;
                        break;
                    }
                } catch (mErr) {}
            }
        }

        removeChatTyping();

        if (!replyText) {
            replyText = "Xin lỗi, không thể kết nối tới AI Coach lúc này. Vui lòng kiểm tra lại mạng hoặc API Key!";
        }

        appendChatMessage("model", replyText);

    } catch (err) {
        removeChatTyping();
        alert("Lỗi khi kết nối Chatbot AI Coach: " + err.message);
    }
}

// Copy rewritten Kaizen statement to clipboard
function copyRewrittenStatement() {
    const el = document.getElementById("rewritten-statement-text");
    if (!el) return;
    const text = el.innerText || el.textContent;
    navigator.clipboard.writeText(text).then(() => {
        alert("📋 Đã sao chép phiên bản Kaizen viết lại chuẩn hóa vào bộ nhớ tạm! Bạn có thể dán vào khung đăng ký chính thức.");
    }).catch(err => {
        alert("Không thể tự động sao chép. Bạn hãy bôi đen và sao chép thủ công.");
    });
}

function isEligibleForEvaluation(rec) {
    const source = rec.phan_loai || '';
    const isOld = !source.includes('Google Sheet');
    const isGS = source.includes('Google Sheet');

    if (isOld) {
        // CSDL cũ: chỉ xem xét những ý tưởng có ghi nhận giá trị tiền thưởng
        const rw = rec.tien_thuong_vnd;
        return rw !== null && rw !== undefined && String(rw).trim() !== '' && String(rw).trim() !== 'None' && parseFloat(rw) > 0;
    }

    if (isGS) {
        // Dữ liệu Google Sheet: chỉ xem xét những ý tưởng có Trạng thái (hệ thống) là "Hoàn thành"
        const stSys = (rec.trang_thai || '').trim().toLowerCase();
        return stSys.includes('hoàn thành');
    }

    return true;
}

// Client-side TF-IDF / N-gram Similarity Engine for Static GitHub Pages
function evaluateClientSide(inputStr, topK = 5) {
    function cleanText(txt) {
        if (!txt) return "";
        return txt.toLowerCase()
            .replace(/[^\w\sàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/g, ' ')
            .replace(/\s+/g, ' ').trim();
    }

    function getNGrams(txt) {
        const words = cleanText(txt).split(' ').filter(w => w.length > 1);
        const ngrams = new Set();
        for (let i = 0; i < words.length; i++) {
            ngrams.add(words[i]);
            if (i < words.length - 1) ngrams.add(words[i] + ' ' + words[i+1]);
            if (i < words.length - 2) ngrams.add(words[i] + ' ' + words[i+1] + ' ' + words[i+2]);
        }
        return ngrams;
    }

    function jaccardSimilarity(setA, setB) {
        if (setA.size === 0 || setB.size === 0) return 0;
        let intersection = 0;
        setA.forEach(val => { if (setB.has(val)) intersection++; });
        const union = setA.size + setB.size - intersection;
        return intersection / union;
    }

    const eligibleRecords = allKaizensCache.filter(isEligibleForEvaluation);
    const inputNGrams = getNGrams(inputStr);
    const scored = eligibleRecords.map(rec => {
        const recText = `${rec.ten_y_tuong || ''} ${rec.ten_y_tuong || ''} ${rec.giai_phap || ''} ${rec.giai_phap || ''} ${rec.thuc_trang || ''}`;
        const recNGrams = getNGrams(recText);
        const sim = jaccardSimilarity(inputNGrams, recNGrams);
        
        const solNGrams = getNGrams(rec.giai_phap || '');
        const solSim = jaccardSimilarity(inputNGrams, solNGrams);

        return {
            ma_kaizen: rec.ma_kaizen,
            nam: rec.nam || 2026,
            ten_y_tuong: rec.ten_y_tuong,
            don_vi: rec.don_vi,
            nguoi_de_xuat: rec.nguoi_de_xuat,
            thuc_trang: rec.thuc_trang,
            giai_phap: rec.giai_phap,
            danh_gia_hieu_qua: rec.danh_gia_hieu_qua,
            nguon_luc: rec.nguon_luc,
            tien_thuong_vnd: rec.tien_thuong_vnd,
            gia_tri_lam_loi_vnd: rec.gia_tri_lam_loi_vnd,
            tinh_trang_khen_thuong: rec.tinh_trang_khen_thuong,
            trang_thai: rec.trang_thai,
            trang_thai_trien_khai: rec.trang_thai_trien_khai,
            trang_thai_duy_tri: rec.trang_thai_duy_tri,
            ngay_gui: rec.ngay_gui,
            overall_similarity_pct: Math.min(99.9, Math.round(sim * 220 * 10) / 10),
            solution_similarity_pct: Math.min(99.9, Math.round(solSim * 200 * 10) / 10)
        };
    });

    scored.sort((a, b) => b.overall_similarity_pct - a.overall_similarity_pct);
    const matches = scored.slice(0, topK);
    const maxScore = matches[0] ? matches[0].overall_similarity_pct : 0;
    const topMatch = matches[0];

    let risk_level, risk_code, reward_policy, recommendation;

    let orig_reward_str = "";
    if (topMatch && topMatch.tien_thuong_vnd) {
        const rwFmt = formatVND(topMatch.tien_thuong_vnd);
        const rw50Fmt = formatVND(topMatch.tien_thuong_vnd * 0.5);
        if (rwFmt) {
            orig_reward_str = ` (Thưởng gốc: ${rwFmt} ➔ Gợi ý thưởng mở rộng 50%: ${rw50Fmt || '50%'})`;
        }
    }

    const relatedCount = matches.filter(m => m.overall_similarity_pct > 3.0).length;
    const countNotice = `🔍 Tìm thấy ${relatedCount} đề tài cải tiến có nội dung/từ khóa liên quan trong CSDL hệ thống.`;

    if (maxScore >= 70) {
        risk_level = "🔴 TRÙNG LẮP HOÀN TOÀN";
        risk_code = "HIGH_DUPLICATE";
        reward_policy = `${countNotice}\n\n⛔ KHÔNG ĐỦ ĐIỀU KIỆN KHEN THƯẢNG (Mức thưởng: 0 VNĐ): Đề tài trùng lặp hoàn toàn (tương đồng ${maxScore}%) với Kaizen gốc [${topMatch.ma_kaizen}].`;
        recommendation = `Ý tưởng trùng lặp hoàn toàn với Kaizen mã [${topMatch.ma_kaizen}] (${topMatch.ten_y_tuong}). Ban Cải Tiến bác bỏ hoặc ghi nhận duy trì.`;
    } else if (maxScore >= 35) {
        risk_level = "🟡 GIẢI PHÁP MỞ RỘNG / TƯƠNG TỰ (THƯỞNG 50%)";
        risk_code = "EXPANDED_SOLUTION";
        reward_policy = `${countNotice}\n\n⚠️ ĐỦ ĐIỀU KIỆN TÍNH THƯỞNG MỞ RỘNG (THƯỞNG 50%): Đề tài có giải pháp tương tự/nhân rộng từ Kaizen gốc [${topMatch.ma_kaizen}]. Mức khen thưởng = 50% mức thưởng gốc${orig_reward_str}.`;
        recommendation = `Đề tài có giải pháp tương tự đề tài gốc [${topMatch.ma_kaizen}] (${topMatch.ten_y_tuong}). Ban Cải Tiến xét duyệt khen thưởng ở mức 50% so với giải pháp gốc.`;
    } else {
        risk_level = "🟢 Ý TƯỞNG MỚI ĐỘC LẬP (THƯỞNG 100%)";
        risk_code = "NEW_IDEA";
        reward_policy = `${countNotice}\n\n✅ ĐỦ ĐIỀU KIỆN KHEN THƯẢNG 100%: Ý tưởng cải tiến mới độc lập, chưa từng có giải pháp tương tự trong CSDL công ty. Đủ điều kiện hưởng 100% mức thưởng tối đa.`;
        recommendation = "Ý tưởng chưa ghi nhận trùng lặp hoặc tương tự trong CSDL công ty. Đủ điều kiện đánh giá khen thưởng mức tối đa (100%).";
    }

    return {
        risk_level,
        risk_code,
        max_similarity_pct: maxScore,
        related_count: relatedCount,
        reward_policy,
        recommendation,
        matched_kaizens: matches
    };
}

// Render Results
function renderEvaluationResult(data, contentText) {
    const coachingWrapper = document.getElementById("coaching-result-wrapper");
    if (coachingWrapper) coachingWrapper.classList.add("hidden");

    const resElem = document.getElementById("eval-result");
    if (resElem) resElem.classList.remove("hidden");

    const score = data.max_similarity_pct || 0;
    setElementText("res-score", `${score}%`);

    const gauge = document.querySelector(".score-gauge");
    if (gauge) {
        let color = "#10b981";
        if (score >= 70) color = "#ef4444";
        else if (score >= 35) color = "#f59e0b";
        gauge.style.background = `radial-gradient(circle at center, #0f172a 60%, transparent 61%), conic-gradient(${color} ${score}%, rgba(255, 255, 255, 0.1) ${score}%)`;
    }

    const badgeElem = document.getElementById("res-risk-badge");
    if (badgeElem) {
        badgeElem.innerText = data.risk_level;
        let badgeClass = "badge-new";
        if (score >= 70) badgeClass = "badge-high";
        else if (score >= 35) badgeClass = "badge-medium";
        badgeElem.className = `risk-badge ${badgeClass}`;
    }

    const snippet = contentText.length > 100 ? contentText.substring(0, 100) + "..." : contentText;
    setElementText("res-idea-title", `Nội dung: "${snippet}"`);
    
    // Parse policy text to preserve line breaks
    const policyElem = document.getElementById("res-policy-text");
    if (policyElem) {
        policyElem.innerText = data.reward_policy;
    }

    const listElem = document.getElementById("res-matched-list");
    if (listElem) {
        listElem.innerHTML = "";

        if (!data.matched_kaizens || data.matched_kaizens.length === 0) {
            listElem.innerHTML = "<p>Không tìm thấy giải pháp tương tự nào trong CSDL.</p>";
            return;
        }

        data.matched_kaizens.forEach((m, idx) => {
            const origRewardFmt = formatVND(m.tien_thuong_vnd);
            const isCompleted = (m.trang_thai || '').includes('Hoàn thành') || (m.trang_thai || '').includes('A3') || (m.trang_thai || '').includes('triển khai') || (m.trang_thai || '').includes('Duy trì');

            let rewardTag = "";
            if (origRewardFmt) {
                rewardTag = `💰 Thưởng thực tế: ${origRewardFmt}`;
            } else if (isCompleted) {
                rewardTag = `💰 Thưởng thực tế: Đã hoàn thành (Theo quy chế VICO)`;
            } else {
                rewardTag = `💰 Thưởng: Theo quy chế VICO`;
            }

            const dateStr = m.ngay_gui ? `Ngày ${m.ngay_gui}` : `Năm ${m.nam || '2026'}`;
            const authorUnitStr = m.don_vi ? `${m.nguoi_de_xuat || 'Hệ thống'} (${m.don_vi})` : `${m.nguoi_de_xuat || 'Hệ thống'}`;

            const llmReasoningHtml = m.llm_reasoning ? `
                <div class="llm-reasoning-box">
                    <i class="fa-solid fa-brain"></i> <strong>Phân tích chuyên sâu từ Gemini AI:</strong> ${m.llm_reasoning}
                </div>
            ` : '';

            const card = document.createElement("div");
            card.className = "match-item match-item-clickable";
            card.onclick = () => openDetailModal(m.ma_kaizen);
            card.title = "Nhấn để xem toàn bộ nội dung chi tiết ý tưởng này";
            card.innerHTML = `
                <div class="match-item-header">
                    <span class="match-code">${m.ma_kaizen}</span>
                    <span class="match-scores">Tương đồng: ${m.overall_similarity_pct}% ${m.solution_similarity_pct !== undefined ? `(Giải pháp: ${m.solution_similarity_pct}%)` : ''}</span>
                </div>
                <div class="match-title">${idx + 1}. ${m.ten_y_tuong}</div>
                <div class="match-meta">
                    <i class="fa-solid fa-user"></i> ${authorUnitStr} | 
                    <i class="fa-solid fa-calendar"></i> ${dateStr} | 
                    <span class="reward-badge">${rewardTag}</span>
                </div>
                <div class="match-details">
                    <strong>Giải pháp gốc trong CSDL:</strong> ${m.giai_phap || 'N/A'}<br>
                    <strong>Thực trạng gốc:</strong> ${m.thuc_trang || 'N/A'}
                    ${llmReasoningHtml}
                </div>
                <div class="match-click-hint">
                    <i class="fa-solid fa-circle-arrow-right"></i> Nhấn vào đây để xem toàn bộ nội dung chi tiết đề tài
                </div>
            `;
            listElem.appendChild(card);
        });
    }
}

function resetForm() {
    const formElem = document.getElementById("eval-form");
    if (formElem) formElem.reset();
    const emptyElem = document.getElementById("empty-state");
    if (emptyElem) emptyElem.classList.remove("hidden");
    const resElem = document.getElementById("eval-result");
    if (resElem) resElem.classList.add("hidden");
}

// Fetch / Filter Database (Tab 2)
async function fetchDatabase(page = 1) {
    if (!isLocalServer) {
        renderStaticTable(page);
        return;
    }

    currentPage = page;
    const qInput = document.getElementById("db-search-input");
    const q = qInput ? qInput.value.trim() : "";
    const statusSelect = document.getElementById("db-filter-status");
    const status = statusSelect ? statusSelect.value : "";

    try {
        const url = `/api/kaizens?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&page=${page}&limit=15`;
        const res = await fetch(url);
        const data = await res.json();

        allKaizensCache = data.kaizens || [];
        renderTable(data.kaizens);

        setElementText("db-page-info", `Hiển thị ${data.kaizens.length} / Tổng ${data.total} Kaizens (Trang ${data.page}/${data.total_pages})`);
        renderPagination(data.page, data.total_pages);

    } catch (err) {
        renderStaticTable(page);
    }
}

function renderStaticTable(page = 1) {
    currentPage = page;
    const qInput = document.getElementById("db-search-input");
    const q = qInput ? qInput.value.trim().toLowerCase() : "";
    const statusSelect = document.getElementById("db-filter-status");
    const status = statusSelect ? statusSelect.value : "";

    let filtered = allKaizensCache.filter(k => {
        if (status && k.trang_thai !== status) return false;
        if (q) {
            const combined = `${k.ma_kaizen} ${k.ten_y_tuong} ${k.thuc_trang} ${k.giai_phap} ${k.nguoi_de_xuat}`.toLowerCase();
            return combined.includes(q);
        }
        return true;
    });

    const limit = 15;
    const totalPages = Math.ceil(filtered.length / limit) || 1;
    const start = (page - 1) * limit;
    const paged = filtered.slice(start, start + limit);

    renderTable(paged);

    setElementText("db-page-info", `Hiển thị ${paged.length} / Tổng ${filtered.length} Kaizens (Trang ${page}/${totalPages})`);
    renderPagination(page, totalPages);
}

function renderTable(kaizens) {
    const tbody = document.getElementById("db-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!kaizens || kaizens.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px;">Không tìm thấy đề tài Kaizen nào.</td></tr>`;
        return;
    }

    kaizens.forEach(k => {
        const rwFmt = formatVND(k.tien_thuong_vnd);
        const rwDisplay = rwFmt ? `<span class="reward-pill">${rwFmt}</span>` : `<span class="reward-pill-none">Theo quy chế</span>`;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong style="color: #60a5fa;">${k.ma_kaizen}</strong></td>
            <td>${k.nam || ''}</td>
            <td><strong>${k.ten_y_tuong}</strong></td>
            <td>${k.nguoi_de_xuat || '-'}</td>
            <td>${rwDisplay}</td>
            <td>
                <button class="btn-view" onclick="openDetailModal('${k.ma_kaizen}')">
                    <i class="fa-solid fa-eye"></i> Xem Chi Tiết
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderPagination(current, totalPages) {
    const container = document.getElementById("db-page-btns");
    if (!container) return;
    container.innerHTML = "";

    if (totalPages <= 1) return;

    if (current > 1) {
        const prevBtn = document.createElement("button");
        prevBtn.className = "page-btn";
        prevBtn.innerText = "« Trước";
        prevBtn.onclick = () => fetchDatabase(current - 1);
        container.appendChild(prevBtn);
    }

    const startP = Math.max(1, current - 2);
    const endP = Math.min(totalPages, current + 2);

    for (let p = startP; p <= endP; p++) {
        const btn = document.createElement("button");
        btn.className = `page-btn ${p === current ? 'active' : ''}`;
        btn.innerText = p;
        btn.onclick = () => fetchDatabase(p);
        container.appendChild(btn);
    }

    if (current < totalPages) {
        const nextBtn = document.createElement("button");
        nextBtn.className = "page-btn";
        nextBtn.innerText = "Sau »";
        nextBtn.onclick = () => fetchDatabase(current + 1);
        container.appendChild(nextBtn);
    }
}

function debounceSearch() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        fetchDatabase(1);
    }, 300);
}

function openDetailModal(maKaizen) {
    const k = allKaizensCache.find(item => item.ma_kaizen === maKaizen);
    if (!k) return;

    setElementText("modal-code", `MÃ KAIZEN: ${k.ma_kaizen} - ${k.ten_y_tuong}`);
    const body = document.getElementById("modal-body");
    if (!body) return;

    const rwFmt = formatVND(k.tien_thuong_vnd) || 'Theo quy định VICO';
    const profitFmt = formatVND(k.gia_tri_lam_loi_vnd) || 'Chưa định lượng';

    body.innerHTML = `
        <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; color: #94a3b8; font-size: 13px;">
            <span><i class="fa-solid fa-user" style="color: #60a5fa;"></i> <strong>Tác giả / Người đề xuất:</strong> ${k.nguoi_de_xuat || 'Hệ thống'}</span>
            ${k.don_vi ? `<span><i class="fa-solid fa-building" style="color: #60a5fa;"></i> <strong>Đơn vị:</strong> ${k.don_vi}</span>` : ''}
            <span><i class="fa-solid fa-calendar" style="color: #60a5fa;"></i> <strong>Năm:</strong> ${k.nam || '2026'}${k.ngay_gui ? ` (${k.ngay_gui})` : ''}</span>
        </div>

        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); padding: 14px 18px; border-radius: 8px; margin-bottom: 14px;">
            <h4 style="color: #60a5fa; margin-bottom: 8px;"><i class="fa-solid fa-square-poll-vertical"></i> 📊 Trạng Thái Đánh Giá & Triển Khai (TĐV):</h4>
            <p style="line-height: 1.6;"><strong>1. Trạng thái (hệ thống):</strong> <span class="match-code" style="font-size: 13px;">${k.trang_thai || 'Báo cáo mới'}</span></p>
            ${k.trang_thai_trien_khai ? `<p style="line-height: 1.6; margin-top: 6px;"><strong>2. Trạng thái triển khai (TĐV):</strong> <span style="color: #34d399; font-weight: 600;">${k.trang_thai_trien_khai}</span></p>` : ''}
            ${k.trang_thai_duy_tri ? `<p style="line-height: 1.6; margin-top: 6px;"><strong>3. Trạng thái duy trì/mở rộng (TĐV):</strong> <span style="color: #fbbf24; font-weight: 600;">${k.trang_thai_duy_tri}</span></p>` : ''}
        </div>
        
        <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); padding: 14px 18px; border-radius: 8px; margin-bottom: 14px;">
            <h4 style="color: #fbbf24; margin-bottom: 6px;"><i class="fa-solid fa-coins"></i> Thông Tin Khen Thưởng & Giá Trị Làm Lợi:</h4>
            <p style="line-height: 1.5;"><strong>Mức tiền thưởng khen thưởng:</strong> <span style="color: #34d399; font-weight: 700; font-size: 15px;">${rwFmt}</span></p>
            <p style="line-height: 1.5; margin-top: 4px;"><strong>Giá trị làm lợi ước tính:</strong> ${profitFmt}</p>
            ${k.tinh_trang_khen_thuong ? `<p style="line-height: 1.5; margin-top: 4px;"><strong>Tình trạng thưởng:</strong> ${k.tinh_trang_khen_thuong}</p>` : ''}
        </div>

        <div style="background: rgba(15,23,42,0.6); padding: 16px; border-radius: 8px; margin-bottom: 14px;">
            <h4 style="color: #60a5fa; margin-bottom: 6px;"><i class="fa-solid fa-triangle-exclamation"></i> ⚠️ Thực Trạng & Vấn Đề Hiện Tại (Đầy Đủ):</h4>
            <p style="line-height: 1.6; white-space: pre-line; color: #f8fafc;">${k.thuc_trang || 'Chưa cập nhật nội dung thực trạng'}</p>
        </div>
        <div style="background: rgba(15,23,42,0.6); padding: 16px; border-radius: 8px; margin-bottom: 14px;">
            <h4 style="color: #34d399; margin-bottom: 6px;"><i class="fa-solid fa-wrench"></i> 🛠️ Giải Pháp Cải Tiến Đã Thực Hiện (Đầy Đủ):</h4>
            <p style="line-height: 1.6; white-space: pre-line; color: #f8fafc;">${k.giai_phap || 'Chưa cập nhật nội dung giải pháp'}</p>
        </div>
        <div style="background: rgba(15,23,42,0.6); padding: 16px; border-radius: 8px;">
            <h4 style="color: #a78bfa; margin-bottom: 6px;"><i class="fa-solid fa-chart-line"></i> ✨ Tính Lợi Ích & Nguồn Lực Thực Hiện:</h4>
            <p style="line-height: 1.6; white-space: pre-line; color: #f8fafc;"><strong>Lợi ích:</strong> ${k.danh_gia_hieu_qua || 'Chưa cập nhật'}</p>
            <p style="line-height: 1.6; margin-top: 6px; white-space: pre-line; color: #f8fafc;"><strong>Nguồn lực:</strong> ${k.nguon_luc || 'Chưa cập nhật'}</p>
        </div>
    `;

    const modalElem = document.getElementById("detail-modal");
    if (modalElem) modalElem.classList.remove("hidden");
}

function closeModal() {
    const modalElem = document.getElementById("detail-modal");
    if (modalElem) modalElem.classList.add("hidden");
}

async function syncGoogleSheet() {
    const btn = document.getElementById("btn-sync");
    if (btn) {
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang Đồng Bộ...`;
        btn.disabled = true;
    }

    try {
        if (isLocalServer) {
            const res = await fetch("/api/sync", { method: "POST" });
            const data = await res.json();
            alert(data.message || "Đã đồng bộ Google Sheet thành công!");
            fetchStats();
            fetchDatabase(1);
        } else {
            await fetchLiveGoogleSheetUpdates();
            updateUIStats();
            renderStaticTable(1);
            alert("Đã đồng bộ trực tuyến dữ liệu mới nhất từ Google Sheet!");
        }
    } catch (err) {
        alert("Lỗi khi đồng bộ: " + err.message);
    } finally {
        if (btn) {
            btn.innerHTML = `<i class="fa-solid fa-rotate"></i> Đồng Bộ Sheet`;
            btn.disabled = false;
        }
    }
}

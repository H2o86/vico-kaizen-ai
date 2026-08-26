let currentPage = 1;
let searchDebounceTimer = null;
let allKaizensCache = [];
let isLocalServer = true;

const LIVE_GS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS3V5Gp8fEM7amTugmV5tXM6ROfKi2X_q-WABk9TJutPITpF0tJd1gBWQ-tKaCHnKpvBqEHymFWbdVT/pub?gid=693129581&single=true&output=csv';

document.addEventListener("DOMContentLoaded", async () => {
    await initApp();
});

function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
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

        const titleM = rowText.match(/💡 Tên ý tưởng:\s*(.*?)(?=\n💡|\n👤|\n🏢|\n📅|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n📊|$)/s);
        const codeM = rowText.match(/💡 Mã ý tưởng:\s*(.*?)(?=\n👤|\n🏢|\n📅|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n📊|$)/s);
        const authorM = rowText.match(/👤 Họ và tên tác giả:\s*(.*?)(?=\n🏢|\n📅|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n📊|$)/s);
        const unitM = rowText.match(/🏢 Đơn vị:\s*(.*?)(?=\n📅|\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n📊|$)/s);
        const dateM = rowText.match(/📅 Ngày gửi:\s*(.*?)(?=\n⚠️|\n🛠️|\n✨|\n💪|\n🚀|\n📊|$)/s);

        const statusM = rowText.match(/⚠️ Hiện trạng và vấn đề:\s*(.*?)(?=\n🛠️|\n✨|\n💪|\n🚀|\n📊|$)/s);
        const solM = rowText.match(/🛠️ Giải pháp:\s*(.*?)(?=\n✨|\n💪|\n🚀|\n📊|$)/s);
        const benM = rowText.match(/✨ Tính lợi ích:\s*(.*?)(?=\n💪|\n🚀|\n📊|$)/s);
        const resM = rowText.match(/💪 Nguồn lực thực hiện:\s*(.*?)(?=\n🚀|\n📊|$)/s);
        
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

    if (tabId === "evaluator-tab") {
        document.querySelectorAll(".tab-btn")[0].classList.add("active");
        document.getElementById("evaluator-tab").classList.add("active");
    } else {
        document.querySelectorAll(".tab-btn")[1].classList.add("active");
        document.getElementById("database-tab").classList.add("active");
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

// Handle AI Evaluation Submit
async function handleEvaluate(e) {
    e.preventDefault();

    const contentText = document.getElementById("input-content").value.trim();
    const topK = parseInt(document.getElementById("input-topk").value);

    if (!contentText) {
        alert("Vui lòng nhập nội dung ý tưởng cải tiến!");
        return;
    }

    const emptyElem = document.getElementById("empty-state");
    if (emptyElem) emptyElem.classList.add("hidden");
    const resElem = document.getElementById("eval-result");
    if (resElem) resElem.classList.add("hidden");
    const loadElem = document.getElementById("loading-state");
    if (loadElem) loadElem.classList.remove("hidden");

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
        const loadElem = document.getElementById("loading-state");
        if (loadElem) loadElem.classList.add("hidden");
    }
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
        // Dữ liệu Google Sheet: chỉ xem xét những ý tưởng đã hoàn thành
        const stSys = (rec.trang_thai || '').toLowerCase();
        const stTk = (rec.trang_thai_trien_khai || '').toLowerCase();
        const stDt = (rec.trang_thai_duy_tri || '').toLowerCase();

        return stSys.includes('hoàn thành') || 
               stSys.includes('a3') || 
               stSys.includes('duy trì') || 
               stSys.includes('đã triển khai') || 
               stTk.includes('hoàn thành') || 
               stDt.includes('hoàn thành') ||
               stDt.includes('duy trì');
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

            const card = document.createElement("div");
            card.className = "match-item match-item-clickable";
            card.onclick = () => openDetailModal(m.ma_kaizen);
            card.title = "Nhấn để xem toàn bộ nội dung chi tiết ý tưởng này";
            card.innerHTML = `
                <div class="match-item-header">
                    <span class="match-code">${m.ma_kaizen}</span>
                    <span class="match-scores">Tương đồng: ${m.overall_similarity_pct}% (Giải pháp: ${m.solution_similarity_pct}%)</span>
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

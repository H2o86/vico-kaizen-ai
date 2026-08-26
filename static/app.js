let currentPage = 1;
let searchDebounceTimer = null;
let allKaizensCache = [];

document.addEventListener("DOMContentLoaded", () => {
    fetchStats();
    fetchDatabase(1);
});

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

// Fetch Global Stats & Populate Filters
async function fetchStats() {
    try {
        const res = await fetch("/api/stats");
        const data = await res.json();

        document.getElementById("stat-total").innerText = data.total_kaizens || 556;
        document.getElementById("stat-total-count").innerText = data.total_kaizens || 556;

        let a3Count = 0;
        let newCount = 0;
        for (const [st, cnt] of Object.entries(data.status_counts || {})) {
            if (st.includes("A3") || st.includes("hoàn thành") || st.includes("Đã triển khai") || st.includes("Duy trì")) {
                a3Count += cnt;
            } else {
                newCount += cnt;
            }
        }
        document.getElementById("stat-a3").innerText = a3Count || 320;

        const unitCount = Object.keys(data.unit_counts || {}).length;
        document.getElementById("stat-units").innerText = unitCount || 15;

        // Populate unit filter dropdown
        const unitSelect = document.getElementById("db-filter-unit");
        unitSelect.innerHTML = '<option value="">Tất cả Đơn vị / Phân xưởng</option>';
        for (const [unitName, _] of Object.entries(data.unit_counts || {})) {
            if (unitName && unitName !== "None") {
                const opt = document.createElement("option");
                opt.value = unitName;
                opt.textContent = unitName;
                unitSelect.appendChild(opt);
            }
        }

        // Populate status filter dropdown
        const statusSelect = document.getElementById("db-filter-status");
        statusSelect.innerHTML = '<option value="">Tất cả Trạng thái</option>';
        for (const [stName, _] of Object.entries(data.status_counts || {})) {
            if (stName && stName !== "None") {
                const opt = document.createElement("option");
                opt.value = stName;
                opt.textContent = stName;
                statusSelect.appendChild(opt);
            }
        }

    } catch (err) {
        console.error("Error fetching stats:", err);
    }
}

// Handle AI Evaluation Submit (Single Content Textarea)
async function handleEvaluate(e) {
    e.preventDefault();

    const contentText = document.getElementById("input-content").value.trim();
    const topK = parseInt(document.getElementById("input-topk").value);

    if (!contentText) {
        alert("Vui lòng nhập nội dung ý tưởng cải tiến!");
        return;
    }

    // Toggle States
    document.getElementById("empty-state").classList.add("hidden");
    document.getElementById("eval-result").classList.add("hidden");
    document.getElementById("loading-state").classList.remove("hidden");

    try {
        const res = await fetch("/api/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                content: contentText,
                top_k: topK
            })
        });

        const data = await res.json();
        renderEvaluationResult(data, contentText);

    } catch (err) {
        console.error("Evaluation error:", err);
        alert("Có lỗi xảy ra khi gọi AI đánh giá: " + err.message);
    } finally {
        document.getElementById("loading-state").classList.add("hidden");
    }
}

// Render AI Evaluation Results with 50% Reward Policy
function renderEvaluationResult(data, contentText) {
    document.getElementById("eval-result").classList.remove("hidden");

    const score = data.max_similarity_pct || 0;
    const scoreElem = document.getElementById("res-score");
    scoreElem.innerText = `${score}%`;

    const gauge = document.querySelector(".score-gauge");
    let color = "#10b981"; // green
    let badgeClass = "badge-new";

    if (score >= 70) {
        color = "#ef4444"; // red
        badgeClass = "badge-high";
    } else if (score >= 35) {
        color = "#f59e0b"; // yellow / amber
        badgeClass = "badge-medium";
    }

    gauge.style.background = `radial-gradient(circle at center, #0f172a 60%, transparent 61%), conic-gradient(${color} ${score}%, rgba(255, 255, 255, 0.1) ${score}%)`;

    const badgeElem = document.getElementById("res-risk-badge");
    badgeElem.innerText = data.risk_level;
    badgeElem.className = `risk-badge ${badgeClass}`;

    // Format snippet preview
    const snippet = contentText.length > 100 ? contentText.substring(0, 100) + "..." : contentText;
    document.getElementById("res-idea-title").innerText = `Nội dung: "${snippet}"`;

    // Render Reward Policy & Recommendation
    document.getElementById("res-policy-text").innerText = data.reward_policy;
    document.getElementById("res-rec-text").innerText = data.recommendation;

    // Render matched items
    const listElem = document.getElementById("res-matched-list");
    listElem.innerHTML = "";

    if (!data.matched_kaizens || data.matched_kaizens.length === 0) {
        listElem.innerHTML = "<p>Không tìm thấy giải pháp tương tự nào trong CSDL.</p>";
        return;
    }

    data.matched_kaizens.forEach((m, idx) => {
        const card = document.createElement("div");
        card.className = "match-item";
        card.innerHTML = `
            <div class="match-item-header">
                <span class="match-code">${m.ma_kaizen}</span>
                <span class="match-scores">Tương đồng: ${m.overall_similarity_pct}% (Giải pháp: ${m.solution_similarity_pct}%)</span>
            </div>
            <div class="match-title">${idx + 1}. ${m.ten_y_tuong}</div>
            <div class="match-meta">
                <i class="fa-solid fa-user"></i> ${m.nguoi_de_xuat || 'Hệ thống'} | 
                <i class="fa-solid fa-building"></i> ${m.don_vi || 'VICO'} | 
                <i class="fa-solid fa-calendar"></i> Năm ${m.nam || '2026'}
            </div>
            <div class="match-details">
                <strong>Giải pháp gốc trong CSDL:</strong> ${m.giai_phap || 'N/A'}<br>
                <strong>Thực trạng gốc:</strong> ${m.thuc_trang || 'N/A'}
            </div>
        `;
        listElem.appendChild(card);
    });
}

function resetForm() {
    document.getElementById("eval-form").reset();
    document.getElementById("empty-state").classList.remove("hidden");
    document.getElementById("eval-result").classList.add("hidden");
}

// Fetch & Display Kaizens Table (Tab 2)
async function fetchDatabase(page = 1) {
    currentPage = page;
    const q = document.getElementById("db-search-input").value.trim();
    const unit = document.getElementById("db-filter-unit").value;
    const status = document.getElementById("db-filter-status").value;

    try {
        const url = `/api/kaizens?q=${encodeURIComponent(q)}&unit=${encodeURIComponent(unit)}&status=${encodeURIComponent(status)}&page=${page}&limit=15`;
        const res = await fetch(url);
        const data = await res.json();

        allKaizensCache = data.kaizens || [];
        renderTable(data.kaizens);

        document.getElementById("db-page-info").innerText = `Hiển thị ${data.kaizens.length} / Tổng ${data.total} Kaizens (Trang ${data.page}/${data.total_pages})`;
        renderPagination(data.page, data.total_pages);

    } catch (err) {
        console.error("Error fetching database:", err);
    }
}

function renderTable(kaizens) {
    const tbody = document.getElementById("db-table-body");
    tbody.innerHTML = "";

    if (!kaizens || kaizens.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px;">Không tìm thấy đề tài Kaizen nào.</td></tr>`;
        return;
    }

    kaizens.forEach(k => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong style="color: #60a5fa;">${k.ma_kaizen}</strong></td>
            <td>${k.nam || ''}</td>
            <td><strong>${k.ten_y_tuong}</strong></td>
            <td>${k.don_vi || '-'}</td>
            <td>${k.nguoi_de_xuat || '-'}</td>
            <td><span class="match-code" style="background: rgba(255,255,255,0.08); color: #cbd5e1;">${k.trang_thai || 'Báo cáo mới'}</span></td>
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

// Open Detail Modal
function openDetailModal(maKaizen) {
    const k = allKaizensCache.find(item => item.ma_kaizen === maKaizen);
    if (!k) return;

    document.getElementById("modal-code").innerText = `MÃ KAIZEN: ${k.ma_kaizen} - ${k.ten_y_tuong}`;
    const body = document.getElementById("modal-body");

    body.innerHTML = `
        <p style="margin-bottom: 12px;"><strong>Đơn vị:</strong> ${k.don_vi || 'N/A'} | <strong>Tác giả:</strong> ${k.nguoi_de_xuat || 'N/A'} | <strong>Trạng thái:</strong> ${k.trang_thai || 'N/A'}</p>
        <div style="background: rgba(15,23,42,0.6); padding: 16px; border-radius: 8px; margin-bottom: 14px;">
            <h4 style="color: #60a5fa; margin-bottom: 6px;">⚠️ Thực Trạng & Vấn Đề Hiện Tại:</h4>
            <p style="line-height: 1.5;">${k.thuc_trang || 'Chưa cập nhật'}</p>
        </div>
        <div style="background: rgba(15,23,42,0.6); padding: 16px; border-radius: 8px; margin-bottom: 14px;">
            <h4 style="color: #34d399; margin-bottom: 6px;">🛠️ Giải Pháp Cải Tiến Đã Thực Hiện:</h4>
            <p style="line-height: 1.5;">${k.giai_phap || 'Chưa cập nhật'}</p>
        </div>
        <div style="background: rgba(15,23,42,0.6); padding: 16px; border-radius: 8px;">
            <h4 style="color: #fbbf24; margin-bottom: 6px;">✨ Tính Lợi Ích & Nguồn Lực:</h4>
            <p style="line-height: 1.5;"><strong>Lợi ích:</strong> ${k.danh_gia_hieu_qua || 'Chưa cập nhật'}</p>
            <p style="line-height: 1.5; margin-top: 6px;"><strong>Nguồn lực:</strong> ${k.nguon_luc || 'Chưa cập nhật'}</p>
        </div>
    `;

    document.getElementById("detail-modal").classList.remove("hidden");
}

function closeModal() {
    document.getElementById("detail-modal").classList.add("hidden");
}

// Trigger Google Sheet Sync
async function syncGoogleSheet() {
    const btn = document.getElementById("btn-sync");
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang Đồng Bộ...`;
    btn.disabled = true;

    try {
        const res = await fetch("/api/sync", { method: "POST" });
        const data = await res.json();
        alert(data.message || "Đã đồng bộ Google Sheet thành công!");
        fetchStats();
        fetchDatabase(1);
    } catch (err) {
        alert("Lỗi khi đồng bộ: " + err.message);
    } finally {
        btn.innerHTML = `<i class="fa-solid fa-rotate"></i> Đồng Bộ Sheet`;
        btn.disabled = false;
    }
}

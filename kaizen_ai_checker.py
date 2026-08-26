import sqlite3
import json
import re
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

class KaizenDuplicateChecker:
    def __init__(self, db_path='kaizen_database.db'):
        self.db_path = db_path
        self.records = []
        self.vectorizer = None
        self.tfidf_matrix = None
        self.load_database()
        self.train_vectorizer()

    def load_database(self):
        """Load records from SQLite database."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, ma_kaizen, nam, ten_y_tuong, don_vi, nguoi_de_xuat,
                   thuc_trang, giai_phap, nguon_luc, danh_gia_hieu_qua,
                   co_hoi_nhan_rong, phan_loai, trang_thai, tien_thuong_vnd, full_text_search
            FROM kaizen_records
        ''')
        rows = cursor.fetchall()
        conn.close()

        self.records = []
        for r in rows:
            rec = {
                'id': r[0],
                'ma_kaizen': r[1],
                'nam': r[2],
                'ten_y_tuong': r[3] or '',
                'don_vi': r[4] or '',
                'nguoi_de_xuat': r[5] or '',
                'thuc_trang': r[6] or '',
                'giai_phap': r[7] or '',
                'nguon_luc': r[8] or '',
                'danh_gia_hieu_qua': r[9] or '',
                'co_hoi_nhan_rong': r[10] or '',
                'phan_loai': r[11] or '',
                'trang_thai': r[12] or '',
                'tien_thuong_vnd': r[13],
                'full_text_search': r[14] or ''
            }
            if self._is_eligible_for_evaluation(rec):
                self.records.append(rec)

        print(f"[KaizenDuplicateChecker] Loaded {len(rows)} total records, indexed {len(self.records)} eligible benchmark records for AI evaluation.")

    def _is_eligible_for_evaluation(self, rec):
        """
        Rule:
        - Master Excel (CSDL cũ): Chỉ xem xét những ý tưởng có ghi nhận giá trị tiền thưởng (> 0).
        - Google Sheet: Chỉ xem xét những ý tưởng đã hoàn thành (Hoàn thành / A3 / Duy trì / Đã triển khai).
        """
        source = rec.get('phan_loai', '')
        is_old = 'Google Sheet' not in source
        is_gs = 'Google Sheet' in source

        if is_old:
            rw = rec.get('tien_thuong_vnd')
            if rw is None or str(rw).strip() in ['', 'None']:
                return False
            try:
                return float(rw) > 0
            except:
                return False

        if is_gs:
            st_sys = (rec.get('trang_thai') or '').strip().lower()
            return 'hoàn thành' in st_sys

        return True

    def preprocess_text(self, text):
        """Clean and normalize Vietnamese text."""
        if not text:
            return ""
        text = text.lower()
        text = re.sub(r'[^\w\sàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def train_vectorizer(self):
        """Build TF-IDF matrix for all historical records."""
        corpus = [
            self.preprocess_text(
                f"{r['ten_y_tuong']} {r['ten_y_tuong']} {r['giai_phap']} {r['giai_phap']} {r['thuc_trang']} {r['don_vi']}"
            )
            for r in self.records
        ]
        self.vectorizer = TfidfVectorizer(ngram_range=(1, 3), min_df=1)
        self.tfidf_matrix = self.vectorizer.fit_transform(corpus)

    def evaluate_proposal(self, content_text, top_k=5):
        """
        Evaluate a single full improvement proposal text.
        Determines similarity, duplicate risk, and 50% reward rule eligibility.
        """
        clean_input = self.preprocess_text(content_text)
        if not clean_input:
            return None

        query_vec = self.vectorizer.transform([clean_input])
        sim_scores = cosine_similarity(query_vec, self.tfidf_matrix).flatten()

        top_indices = np.argsort(sim_scores)[::-1][:top_k]

        matches = []
        for idx in top_indices:
            score = float(sim_scores[idx])
            rec = self.records[idx]

            # Compute specific solution text similarity
            sol_clean = self.preprocess_text(rec['giai_phap'])
            sol_sim = 0.0
            if sol_clean:
                vec_s = TfidfVectorizer(ngram_range=(1, 2), min_df=1).fit_transform([sol_clean, clean_input])
                sol_sim = float(cosine_similarity(vec_s[0], vec_s[1])[0][0])

            matches.append({
                'ma_kaizen': rec['ma_kaizen'],
                'nam': rec['nam'],
                'ngay_gui': rec.get('ngay_gui', ''),
                'ten_y_tuong': rec['ten_y_tuong'],
                'don_vi': rec['don_vi'],
                'nguoi_de_xuat': rec['nguoi_de_xuat'],
                'thuc_trang': rec['thuc_trang'],
                'giai_phap': rec['giai_phap'],
                'danh_gia_hieu_qua': rec['danh_gia_hieu_qua'],
                'tien_thuong_vnd': rec['tien_thuong_vnd'],
                'trang_thai': rec.get('trang_thai', ''),
                'overall_similarity_pct': round(score * 100, 1),
                'solution_similarity_pct': round(sol_sim * 100, 1)
            })

        max_score = matches[0]['overall_similarity_pct'] if matches else 0
        top_match = matches[0] if matches else None
        related_count = sum(1 for m in matches if m['overall_similarity_pct'] > 3.0)

        orig_reward_str = ""
        if top_match and top_match.get('tien_thuong_vnd'):
            try:
                rw = float(top_match['tien_thuong_vnd'])
                rw_50 = float(rw * 0.5)
                orig_reward_str = f" (Thưởng gốc: {rw:,.0f} VNĐ ➔ Gợi ý thưởng mở rộng 50%: {rw_50:,.0f} VNĐ)"
            except:
                pass

        # Summary count notification string
        count_notice = f"🔍 Tìm thấy {related_count} đề tài cải tiến có nội dung/từ khóa liên quan trong CSDL hệ thống."

        # Determine Duplicate Risk Level & Reward Policy (50% Rule)
        if max_score >= 70:
            risk_level = "🔴 TRÙNG LẮP HOÀN TOÀN"
            risk_code = "HIGH_DUPLICATE"
            reward_policy = f"{count_notice}\n\n⛔ KHÔNG ĐỦ ĐIỀU KIỆN KHEN THƯỞNG (Mức thưởng: 0 VNĐ): Đề tài trùng lặp hoàn toàn (tương đồng {max_score}%) với Kaizen mã [{top_match['ma_kaizen']}]."
            recommendation = f"Ý tưởng trùng lặp hoàn toàn với Kaizen mã [{top_match['ma_kaizen']}] ({top_match['ten_y_tuong']}). Ban Cải Tiến loại bỏ hoặc ghi nhận duy trì."
        elif max_score >= 35:
            risk_level = "🟡 GIẢI PHÁP MỞ RỘNG / TƯƠNG TỰ (THƯỞNG 50%)"
            risk_code = "EXPANDED_SOLUTION"
            reward_policy = f"{count_notice}\n\n⚠️ ĐỦ ĐIỀU KIỆN TÍNH THƯỞNG MỞ RỘNG (THƯỞNG 50%): Đề tài có giải pháp tương tự/nhân rộng từ Kaizen gốc [{top_match['ma_kaizen']}]. Theo quy định công ty, mức khen thưởng = 50% mức thưởng giải pháp gốc{orig_reward_str}."
            recommendation = f"Đề tài có giải pháp tương tự đề tài gốc [{top_match['ma_kaizen']}] ({top_match['ten_y_tuong']}). Ban Cải Tiến xét duyệt khen thưởng ở mức 50% so với giải pháp gốc."
        else:
            risk_level = "🟢 Ý TƯỞNG MỚI ĐỘC LẬP (THƯỞNG 100%)"
            risk_code = "NEW_IDEA"
            reward_policy = f"{count_notice}\n\n✅ ĐỦ ĐIỀU KIỆN KHEN THƯỞNG 100%: Ý tưởng cải tiến mới độc lập, chưa từng có giải pháp tương tự trong CSDL công ty. Đủ điều kiện hưởng 100% mức thưởng tối đa."
            recommendation = "Ý tưởng chưa ghi nhận trùng lặp hoặc tương tự trong CSDL công ty. Đủ điều kiện đánh giá khen thưởng mức tối đa (100%)."

        report_md = self._format_report(content_text, risk_level, reward_policy, recommendation, matches)

        return {
            'risk_level': risk_level,
            'risk_code': risk_code,
            'max_similarity_pct': max_score,
            'related_count': related_count,
            'reward_policy': reward_policy,
            'recommendation': recommendation,
            'matched_kaizens': matches,
            'report_markdown': report_md
        }

    def _format_report(self, content_text, risk_level, reward_policy, recommendation, matches):
        md = []
        md.append(f"# 🤖 BÁO CÁO AI ĐÁNH GIÁ TRÙNG LẮP & CHÍNH SÁCH KHEN THƯỞNG\n")
        md.append(f"**Nội dung ý tưởng nhập:**\n> {content_text[:300]}...\n")
        md.append(f"---\n")
        md.append(f"### 📊 ĐÁNH GIÁ CỦA AI:")
        md.append(f"- **Phân loại:** {risk_level}")
        md.append(f"- **Chính sách tiền thưởng:** {reward_policy}")
        md.append(f"- **Khuyến nghị cho Ban Cải Tiến:** {recommendation}\n")

        md.append(f"### 🔍 TOP CÁC GIẢI PHÁP TƯƠNG TỰ TRONG CƠ SỞ DỮ LIỆU:")
        for idx, m in enumerate(matches, 1):
            md.append(f"#### {idx}. [{m['ma_kaizen']}] {m['ten_y_tuong']} (Năm {m['nam']})")
            md.append(f"- **Tương đồng tổng thể:** `{m['overall_similarity_pct']}%` | **Tương đồng giải pháp:** `{m['solution_similarity_pct']}%`")
            md.append(f"- **Người đề xuất / Đơn vị:** {m['nguoi_de_xuat']} ({m['don_vi']})")
            md.append(f"- **Giải pháp gốc:** {m['giai_phap'][:200]}..." if len(m['giai_phap']) > 200 else f"- **Giải pháp gốc:** {m['giai_phap']}")
            md.append("")

        return "\n".join(md)

if __name__ == '__main__':
    checker = KaizenDuplicateChecker()
    res = checker.evaluate_proposal("Lắp nắp che tôn bảo vệ đầu tay kéo máng lấy điện cẩu trục xoay tránh chập mưa")
    print(res['report_markdown'])

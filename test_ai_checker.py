import sys
from kaizen_ai_checker import KaizenDuplicateChecker

print("=== STARTING AI DUPLICATE CHECKER VERIFICATION TESTS ===")

checker = KaizenDuplicateChecker(db_path='kaizen_database.db')

test_cases = [
    {
        'name': 'TEST 1: Ý tưởng trùng lặp 100% (Máng điện cẩu trục)',
        'title': 'Lắp thanh chắn bảo vệ máng điện cẩu trục xoay',
        'status_quo': 'Khi cẩu trục xoay vận hành, máng điện thường va chạm với cẩu gây hỏng hóc máng điện và dừng máy sửa chữa.',
        'solution': 'Lắp thanh chắn sắt bảo vệ tránh va chạm giữa cẩu trục và máng điện.',
        'unit': 'PX Đúc'
    },
    {
        'name': 'TEST 2: Ý tưởng tương tự / Trùng lặp một phần (Máy mài lưỡi cưa)',
        'title': 'Chế tạo máy mài tự động lưỡi cưa đĩa và cưa vòng',
        'status_quo': 'Công nhân mài tay lưỡi cưa thủ công tốn thời gian, rủi ro mất an toàn và hư hỏng lưỡi cưa.',
        'solution': 'Trang bị máy mài tự động để tăng tuổi thọ sử dụng lưỡi cưa.',
        'unit': 'Xưởng gia công'
    },
    {
        'name': 'TEST 3: Ý tưởng hoàn toàn mới (AI & Computer Vision)',
        'title': 'Ứng dụng hệ thống thị giác máy tính AI tự động quét khuyết tật bề mặt sản phẩm đúc',
        'status_quo': 'Kiểm tra lỗi bề mặt vật đúc hoàn toàn thủ công bằng mắt thường dễ bỏ sót sản phẩm lỗi.',
        'solution': 'Lắp đặt camera IP độ phân giải cao kết hợp mô hình AI Deep Learning phát hiện rỗ khí, nứt bề mặt tự động trên băng tải.',
        'unit': 'Phòng QC'
    }
]

for tc in test_cases:
    print("\n==================================================")
    print(f"RUNNING: {tc['name']}")
    print("==================================================")
    res = checker.evaluate_proposal(
        title=tc['title'],
        status_quo=tc['status_quo'],
        solution=tc['solution'],
        unit=tc['unit']
    )
    
    print(f"Mức độ đánh giá: {res['risk_level']}")
    print(f"Độ tương đồng lớn nhất: {res['max_similarity_pct']}%")
    print(f"Khuyến nghị: {res['recommendation']}")
    print("\n--- TOP MATCHES ---")
    for m in res['matched_kaizens']:
        print(f"  - [{m['ma_kaizen']}] {m['ten_y_tuong']} ({m['don_vi']}) -> Overall: {m['overall_similarity_pct']}%, Title: {m['title_similarity_pct']}%")

print("\n=== ALL AI DUPLICATE CHECKER TESTS COMPLETED SUCCESSFULLY ===")

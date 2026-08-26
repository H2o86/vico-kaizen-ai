import sys
import argparse
from kaizen_ai_checker import KaizenDuplicateChecker

def main():
    parser = argparse.ArgumentParser(description="Công cụ AI Kiểm tra Trùng lặp Cải tiến VICO")
    parser.add_argument("--title", type=str, help="Tên đề tài / ý tưởng cải tiến")
    parser.add_argument("--status", type=str, default="", help="Thực trạng / Vấn đề trước cải tiến")
    parser.add_argument("--solution", type=str, default="", help="Giải pháp cải tiến đề xuất")
    parser.add_argument("--unit", type=str, default="", help="Đơn vị / Phân xưởng áp dụng")

    args = parser.parse_args()

    checker = KaizenDuplicateChecker(db_path='kaizen_database.db')

    if not args.title:
        print("==================================================")
        print("   HỆ THỐNG AI ĐÁNH GIÁ TRÙNG LẮP CẢI TIẾN VICO")
        print("==================================================")
        title = input("Nhập Tên ý tưởng cải tiến: ").strip()
        if not title:
            print("Chưa nhập tên ý tưởng. Thoát chương trình.")
            return
        status = input("Nhập Thực trạng (tùy chọn): ").strip()
        solution = input("Nhập Giải pháp đề xuất (tùy chọn): ").strip()
        unit = input("Nhập Đơn vị / Phân xưởng (tùy chọn): ").strip()
    else:
        title = args.title
        status = args.status
        solution = args.solution
        unit = args.unit

    res = checker.evaluate_proposal(
        title=title,
        status_quo=status,
        solution=solution,
        unit=unit
    )

    print("\n" + res['report_markdown'])

if __name__ == '__main__':
    main()

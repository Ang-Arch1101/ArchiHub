# -*- coding: utf-8 -*-
"""索引表 PDF 掃描器 — Move 1 spike，讀一份圖紙索引表 PDF、抽出圖號清單。

這是開發期一次性工具，不是 server.py 的執行期程式碼，因此允許依賴外部命令
`pdftotext`（xpdf 或 poppler 皆可，需在 PATH 上）——標準庫沒有 PDF 文字抽取能力。

已知限制（實測三份真實索引表得到的結論，不是本腳本的 bug）：
  - 有些索引表 PDF 用的是無 ToUnicode 對照表的 CID 子集字型，圖號抓得到但中文
    標題抓不到，會印出空白 + title_confidence=low。
  - 有些索引表 PDF 本質是 CAD 匯出的向量圖框（表格線+獨立文字物件），
    pdftotext 完全抽不到清單本體，這種情況腳本會回報失敗並建議改用 --folder
    去看 CAD 資料夾檔名當診斷樣本，而不是假裝抽到東西。

絕對不寫入、不修改 register/register.csv 或 register/glossary.json，
只印到終端機 + 另存到 --out 指定的預覽檔（預設 register/scan_preview.csv）。

用法：
    python register/scan_index.py <索引表.pdf> --discipline A
    python register/scan_index.py <索引表.pdf> --discipline S --pages 1-3
    python register/scan_index.py <索引表.pdf> --discipline E --folder "機電/CAD/電氣/CAD"
"""
import argparse
import csv
import re
import shutil
import subprocess
import sys
from pathlib import Path

# Windows 主控台預設常是 cp950/Big5，會炸掉中文與 ✓/✗ 這類符號；強制 UTF-8。
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent

# 圖號樣式：比 server.py 的 DWG_CODE 寬鬆許多，因為這個專案實際出現
# A0 / A0-00 / S7 / ST-00 這類非 "字母-3位數" 的格式。
# 只有在後面緊跟著 1~3 位數字（索引表的頁碼/項次欄）時才算一列匹配，
# 用來過濾掉標題欄裡的比例尺（如 A1:150）之類的雜訊。
DWG_ROW = re.compile(
    r"(?<![A-Z0-9])(?<!\d-)([A-Z]{1,3}\d{0,2}(?:-[0-9A-Z]{1,3})?)\s+(\d{1,3})(?!/)\b"
)
# 一列裡，圖號+頁碼之後若還有中文字，當作標題猜測（常常抓不到，見上方已知限制）
TITLE_TAIL = re.compile(r"[一-鿿（）()、/．.]{2,}")

REGISTER_HEADER = [
    "drawing_no", "title", "project_id", "building", "floor",
    "discipline", "current_ver", "cad_path", "pdf_path", "aliases",
]


def check_pdftotext():
    if shutil.which("pdftotext") is None:
        print("錯誤：找不到 pdftotext 指令。", file=sys.stderr)
        print("這個腳本需要 xpdf 或 poppler 的 pdftotext 在 PATH 上，"
              "標準庫沒有 PDF 文字抽取能力。", file=sys.stderr)
        sys.exit(1)


def run_pdftotext(pdf_path: Path, pages: str | None) -> str:
    cmd = ["pdftotext", "-table"]
    if pages:
        try:
            start, end = pages.split("-")
            cmd += ["-f", start, "-l", end]
        except ValueError:
            print(f"警告：--pages 格式應為 N-M，忽略 {pages!r}", file=sys.stderr)
    cmd += [str(pdf_path), "-"]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.stderr.strip():
        # xpdf 常見的 "Syntax Warning" 不是致命錯誤，只印出來供排查，不中斷
        for line in result.stderr.strip().splitlines():
            print(f"  [pdftotext] {line}", file=sys.stderr)
    return result.stdout


def extract_rows(text: str):
    rows = []
    for line in text.splitlines():
        for m in DWG_ROW.finditer(line):
            drawing_no, _seq = m.groups()
            tail = line[m.end():]
            title_match = TITLE_TAIL.search(tail)
            title = title_match.group(0).strip() if title_match else ""
            rows.append({
                "drawing_no": drawing_no,
                "title": title,
                "title_confidence": "low" if not title else "medium",
            })
    return rows


def sample_folder(folder: Path, limit: int = 20):
    if not folder.is_dir():
        print(f"警告：--folder 指定的路徑不存在或不是資料夾：{folder}", file=sys.stderr)
        return []
    names = sorted(f.name for f in folder.iterdir() if f.is_file())
    return names[:limit]


def write_preview(rows, discipline: str, out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=REGISTER_HEADER)
        writer.writeheader()
        for r in rows:
            writer.writerow({
                "drawing_no": r["drawing_no"],
                "title": r["title"],
                "project_id": "",
                "building": "",
                "floor": "",
                "discipline": discipline or "",
                "current_ver": "",
                "cad_path": "",
                "pdf_path": "",
                "aliases": "",
            })


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", type=Path, help="索引表 PDF 路徑")
    ap.add_argument("--discipline", default="", help="標記這批結果屬於哪個專業，如 A / S / E")
    ap.add_argument("--pages", default=None, help="頁碼範圍，如 1-3（合併 PDF 用）")
    ap.add_argument("--folder", type=Path, default=None,
                     help="PDF 抽取失敗時的降級來源：對應的 CAD 資料夾，列出前幾個檔名當診斷樣本")
    ap.add_argument("--out", type=Path, default=ROOT / "register" / "scan_preview.csv",
                     help="預覽輸出檔路徑（絕不寫入 register.csv 本身）")
    args = ap.parse_args()

    check_pdftotext()

    if not args.pdf.is_file():
        print(f"錯誤：找不到檔案 {args.pdf}", file=sys.stderr)
        sys.exit(1)

    print(f"掃描 {args.pdf.name} …")
    text = run_pdftotext(args.pdf, args.pages)
    rows = extract_rows(text)

    if not rows:
        print("✗ 抽不到任何圖號列。這份索引表可能是向量圖框（無文字層）或字型無法辨識。")
        if args.folder:
            sample = sample_folder(args.folder)
            if sample:
                print(f"\n改列出 {args.folder} 的前 {len(sample)} 個檔名當診斷樣本（不是自動當成圖號清單）：")
                for name in sample:
                    print(f"  {name}")
            print("\n建議：確認是否有 Excel/文字版的索引表，或人工核對這批檔名的命名規則。")
        else:
            print("建議：加 --folder 指向對應的 CAD 資料夾，看檔名長什麼樣；"
                  "或確認是否有 Excel 版的索引表。")
        sys.exit(0)

    low_conf = [r for r in rows if r["title_confidence"] == "low"]
    print(f"✓ 抽到 {len(rows)} 個圖號" + (f"（其中 {len(low_conf)} 個標題抓不到，需人工核對）" if low_conf else ""))

    print(f"\n{'drawing_no':<12} title")
    print("-" * 50)
    for r in rows:
        title_display = r["title"] if r["title"] else "（無，字型無法還原中文）"
        print(f"{r['drawing_no']:<12} {title_display}")

    write_preview(rows, args.discipline, args.out)
    print(f"\n→ 已寫入 {args.out}，請人工核對後自行貼回 register/register.csv（本腳本不會自動改動它）。")


if __name__ == "__main__":
    main()

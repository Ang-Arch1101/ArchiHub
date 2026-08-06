# -*- coding: utf-8 -*-
"""ArchiHub 單機多人作業模擬 — 從合成信件自動產生任務，並用真實狀態機驅動出
「多人協作進行到一半」的看板。你在同一台電腦切換「我的名字」即可從各角色操作。

做的事：
  1. 建立獨立的「SIM 專案」資料夾（作業檔 / 出圖檔 / 信件 / 筆記），不動 sample/
  2. 為每個用到的圖號生成占位 CAD(.dwg) 與可渲染的 PDF(.pdf)
  3. 讀 synthetic-data-gen 的信件 → 自動產生一批 Request（分派給不同 designer / requester）
  4. 以正確身分驅動狀態機：部分接受、提交、確認、退回重修、拒絕 → 產生變化多樣的看板
  5. 其餘信件留在收件匣，供你自己練習「萃取 → 建單」

用法：
    python sim/run_sim.py            # 若 8734 沒開會自動幫你啟動 server
    python sim/run_sim.py --reset    # 清掉舊的 SIM 資料重跑

零外部依賴（Python 3.10+ 標準庫）。
"""
import argparse
import json
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SIM = ROOT / "sim" / "project"
GT = ROOT / "synthetic-data-gen" / "output" / "ground_truth.jsonl"
EMAILS = ROOT / "synthetic-data-gen" / "output"
CONFIG = ROOT / "config.json"
DATA = ROOT / "data"
PORT = 8734
BASE = f"http://127.0.0.1:{PORT}"

DESIGNERS = ["阿勳", "小柯"]
POOL = ["A-101", "A-201", "A-301", "A-501", "E-301", "M-201"]  # alias-only 對應池

# 每個 seed 任務要驅動到的狀態（依序套在自動產生的前 N 筆）
SEED_PLAN = [
    ("red", "剛萃取・待接受"),
    ("red", "剛萃取・待接受"),
    ("red", "剛萃取・待接受"),
    ("accept", "已接受・本地編輯中（鎖定）"),
    ("accept", "已接受・本地編輯中（鎖定）"),
    ("submit", "已提交・待確認"),
    ("submit", "已提交・待確認"),
    ("reject", "退回重修中"),
    ("decline", "任務被拒・待釐清"),
    ("confirm", "已進版結案"),
    ("confirm", "已進版結案"),
    ("red", "剛萃取・待接受"),
    ("red", "剛萃取・待接受"),
    ("red", "剛萃取・待接受"),
]


# ── HTTP ───────────────────────────────────────────────
def call(path, payload=None, timeout=5):
    url = BASE + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json"},
                                 method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def server_alive():
    try:
        call("/api/state", timeout=2)
        return True
    except (urllib.error.URLError, OSError, ValueError):
        return False


# ── 最小可渲染 PDF ──────────────────────────────────────
def make_pdf(path, code):
    """產生一頁 A4、含圖號與示意平面的合法 PDF（純 ASCII，pdf.js 可渲染）。"""
    content = (
        "0.13 0.15 0.16 RG 2 w 40 40 515 762 re S\n"
        "0.78 0.80 0.82 RG 1.5 w 90 470 200 220 re S 305 470 200 220 re S 90 150 415 250 re S\n"
        "BT /F1 11 Tf 60 812 Td (ArchiHub SIM - central drawing) Tj ET\n"
        f"BT /F1 40 Tf 70 690 Td ({code}) Tj ET\n"
        "BT /F1 13 Tf 100 560 Td (ROOM A) Tj ET\n"
        "BT /F1 13 Tf 320 560 Td (ROOM B) Tj ET\n"
        "BT /F1 13 Tf 110 260 Td (CORRIDOR / SERVICE) Tj ET\n"
    )
    cb = content.encode("latin-1")
    objs = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
        b"<</Length %d>>\nstream\n" % len(cb) + cb + b"\nendstream",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n" % (len(objs) + 1)
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF" % (len(objs) + 1, xref)
    path.write_bytes(out)


# ── 準備資料夾與檔案 ────────────────────────────────────
def resolve_drawing(er):
    ref = er.get("drawing_ref")
    if ref:
        return ref
    alias = er.get("drawing_ref_alias") or "x"
    return POOL[sum(ord(c) for c in alias) % len(POOL)]


def load_ground_truth():
    rows = []
    for line in GT.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def build_folders(rows, seed_files):
    cad = SIM / "01_作業檔"
    pdf = SIM / "02_出圖檔"
    mail = SIM / "信件"
    note = SIM / "筆記"
    for d in (cad, pdf, mail, note):
        shutil.rmtree(d, ignore_errors=True)
        d.mkdir(parents=True, exist_ok=True)

    # 用到的圖號 → 生成 CAD + PDF
    codes = set()
    for r in rows:
        if r.get("is_actionable") and r.get("expected_requests"):
            codes.add(resolve_drawing(r["expected_requests"][0]))
    for code in sorted(codes):
        (cad / f"{code}.dwg").write_text(f"; ArchiHub SIM placeholder CAD for {code}\n", encoding="utf-8")
        make_pdf(pdf / f"{code}_v1.0-r01.pdf", code)

    # 未被 seed 的信件 → 丟進收件匣（現場筆記進 筆記/，其餘進 信件/）
    for r in rows:
        if r["file"] in seed_files:
            continue
        src = EMAILS / r["file"]
        if not src.exists():
            continue
        dst_dir = note if r.get("category") == "field_note_casual" else mail
        shutil.copy2(src, dst_dir / r["file"])
    return sorted(codes)


def seed_history(codes):
    hist = {c: {"name": c, "history": [{
        "ver": "v1.0-r01", "date": "06/02", "note": "初版發行",
        "designer": "阿勳", "approver": "林主任", "req": "—",
    }]} for c in codes}
    (DATA / "sim").mkdir(parents=True, exist_ok=True)
    (DATA / "sim" / "requests.json").write_text(
        json.dumps({"seq": 1, "requests": []}, ensure_ascii=False, indent=2), encoding="utf-8")
    (DATA / "sim" / "history.json").write_text(
        json.dumps(hist, ensure_ascii=False, indent=2), encoding="utf-8")


def register_project():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {
        "currentUser": "阿勳", "port": PORT, "currentProject": "928816",
        "projects": [{"id": "928816", "name": "928816 · 竹北廠區新建工程",
                      "cadDir": "sample/01_作業檔", "pdfDir": "sample/02_出圖檔",
                      "mailDir": "sample/inbox/mail", "noteDir": "sample/inbox/notes"}],
    }
    cfg.setdefault("projects", [])
    sim_proj = {"id": "sim", "name": "SIM · 多人作業模擬",
                "cadDir": "sim/project/01_作業檔", "pdfDir": "sim/project/02_出圖檔",
                "mailDir": "sim/project/信件", "noteDir": "sim/project/筆記"}
    cfg["projects"] = [p for p in cfg["projects"] if p["id"] != "sim"] + [sim_proj]
    cfg["currentProject"] = "sim"
    cfg["currentUser"] = "阿勳"
    cfg["port"] = PORT
    CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


# ── 建立任務並驅動狀態機 ────────────────────────────────
def seed_requests(rows):
    seeded = []
    n = 0
    for r in rows:
        if n >= len(SEED_PLAN):
            break
        if not (r.get("is_actionable") and r.get("expected_requests")):
            continue
        er = r["expected_requests"][0]
        drawing = resolve_drawing(er)
        designer = DESIGNERS[n % len(DESIGNERS)]
        requester = r["sender_name"] + (r.get("sender_title") or "")
        is_note = r.get("category") == "field_note_casual"
        source = {
            "type": "note" if is_note else "email",
            "icon": "📝" if is_note else "📧",
            "from": (f"{requester}（現場筆記）" if is_note
                     else f"{requester}〈{r.get('sender_email') or 'demo@demo'}〉"),
            "quote": (er.get("quoted_text") or "")[:120],
        }
        pos = {"nx": round(0.25 + 0.5 * ((n * 37 % 100) / 100), 3),
               "ny": round(0.25 + 0.45 * ((n * 53 % 100) / 100), 3)}
        res = call("/api/requests", {
            "title": er.get("title") or "(未命名)",
            "drawing": drawing,
            "requester": requester,
            "designer": designer,
            "due": er.get("due_date") or "",
            "source": source,
            "sourceLabel": "信件" if not is_note else "筆記",
            "pos": pos,
        })
        rid = res["request"]["id"]
        state, label = SEED_PLAN[n]
        seeded.append({"rid": rid, "designer": designer, "requester": requester,
                       "drawing": drawing, "title": er.get("title"), "state": state, "label": label,
                       "src_file": r["file"]})
        n += 1
    return seeded


def advance(s):
    rid, d, req, state = s["rid"], s["designer"], s["requester"], s["state"]
    if state in ("accept", "submit", "reject", "confirm"):
        call(f"/api/requests/{rid}/accept", {"actor": d})
    if state in ("submit", "reject", "confirm"):
        call(f"/api/requests/{rid}/submit", {"actor": d})
    if state == "reject":
        call(f"/api/requests/{rid}/reject",
             {"actor": req, "reason": "方向反了，應往西移，請改正後重新提交",
              "pos": {"nx": 0.46, "ny": 0.52}})
    if state == "confirm":
        call(f"/api/requests/{rid}/confirm", {"actor": req})
    if state == "decline":
        call(f"/api/requests/{rid}/decline",
             {"actor": d, "reason": "需求範圍不清，想先確認是哪一支柱／哪一區"})


# ── 主流程 ─────────────────────────────────────────────
def print_board(seeded):
    by_state = {}
    for s in seeded:
        by_state.setdefault(s["label"], []).append(s)
    print("\n" + "═" * 60)
    print("  SIM 看板已就緒 —— 這是一個多人協作進行到一半的專案")
    print("═" * 60)
    for label in dict.fromkeys(x[1] for x in SEED_PLAN):
        items = by_state.get(label, [])
        if not items:
            continue
        print(f"\n▍{label}（{len(items)}）")
        for s in items:
            print(f"    {s['rid']}  {s['drawing']}  「{s['title']}」")
            print(f"          designer={s['designer']}  requester={s['requester']}")
    print("\n" + "═" * 60)
    print("  下一步：開 http://localhost:%d，右上「⚙ 設定」把「我的名字」" % PORT)
    print("  切成下列任一人，看每個人各自的待辦 / 待確認：")
    designers = sorted({s["designer"] for s in seeded})
    requesters = sorted({s["requester"] for s in seeded})
    print("    設計端（有『待辦作業』可接／改）：" + "、".join(designers))
    print("    需求端（有『待我確認』可核／退）：" + "、".join(requesters[:4]) + " …")
    print("  詳細腳本見 sim/多人作業模擬腳本.md")
    print("═" * 60 + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="清掉舊的 SIM 資料重跑")
    args = ap.parse_args()

    if not GT.exists():
        print("⚠ 找不到合成信件，請先跑：python synthetic-data-gen/generate_emails.py")
        sys.exit(1)

    if args.reset:
        shutil.rmtree(DATA / "sim", ignore_errors=True)
        shutil.rmtree(SIM, ignore_errors=True)

    rows = load_ground_truth()

    # 先決定要 seed 哪些信件（前 len(SEED_PLAN) 筆 actionable）
    seed_files, cnt = set(), 0
    for r in rows:
        if cnt >= len(SEED_PLAN):
            break
        if r.get("is_actionable") and r.get("expected_requests"):
            seed_files.add(r["file"])
            cnt += 1

    print("① 建立 SIM 專案資料夾與圖檔…")
    codes = build_folders(rows, seed_files)
    print(f"   圖號 {len(codes)} 個：{'、'.join(codes)}")
    seed_history(codes)
    register_project()

    # 啟動或沿用 server
    spawned = None
    if not server_alive():
        print("② 8734 沒開，幫你啟動 server.py…")
        spawned = subprocess.Popen([sys.executable, str(ROOT / "server.py")], cwd=str(ROOT))
        for _ in range(30):
            time.sleep(0.4)
            if server_alive():
                break
        else:
            print("⚠ server 未能啟動，請手動 python server.py 後重跑")
            sys.exit(1)
    else:
        print("② 沿用已在執行的 server（已切換到 SIM 專案，回瀏覽器重新整理即可）")

    print("③ 從信件自動產生任務並驅動多人流程…")
    seeded = seed_requests(rows)
    for s in seeded:
        advance(s)

    print_board(seeded)

    if spawned:
        print("（server 由本腳本啟動，Ctrl+C 結束）")
        try:
            spawned.wait()
        except KeyboardInterrupt:
            spawned.terminate()


if __name__ == "__main__":
    main()

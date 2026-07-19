# -*- coding: utf-8 -*-
"""ArchiHub 後端 — 工程圖面的 GitHub
零外部依賴（Python 3.10+ 標準庫），負責：
  1. 讀取本地資料夾（CAD 作業檔 / PDF 出圖檔 / 收件匣文字檔）
  2. Request 狀態機：紅(待處理) → 黃(待確認) → 綠(已進版)
  3. 進版流水號管理，confirm 時自動複製產生新版 PDF
  4. 呼叫作業系統開啟實際檔案（前往任務）
啟動：python server.py   →  http://localhost:8734
"""
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
DATA = ROOT / "data"
CONFIG_PATH = ROOT / "config.json"

DWG_CODE = re.compile(r"^([A-Z]{1,2}-\d{3})")
VER_RE = re.compile(r"v(\d+)\.(\d+)-r(\d+)")

DEFAULT_CONFIG = {
    "currentUser": "阿勳",
    "cadDir": "sample/01_作業檔",
    "pdfDir": "sample/02_出圖檔",
    "inboxDir": "sample/inbox",
    "port": 8734,
}


# ── 存取 ────────────────────────────────────────────────
def load_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def save_json(path, obj):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def get_config():
    cfg = {**DEFAULT_CONFIG, **load_json(CONFIG_PATH, {})}
    return cfg


def resolve_dir(rel):
    p = Path(rel)
    return p if p.is_absolute() else ROOT / p


def now_str():
    return datetime.now().strftime("%m/%d %H:%M")


# ── 資料夾掃描 ──────────────────────────────────────────
def scan_files(dirpath, exts):
    d = resolve_dir(dirpath)
    out = []
    if not d.is_dir():
        return out
    for f in sorted(d.iterdir()):
        if f.is_file() and f.suffix.lower() in exts:
            m = DWG_CODE.match(f.name)
            out.append({
                "name": f.name,
                "code": m.group(1) if m else None,
                "size": f.stat().st_size,
                "mtime": datetime.fromtimestamp(f.stat().st_mtime).strftime("%m/%d %H:%M"),
            })
    return out


def scan_inbox(dirpath):
    d = resolve_dir(dirpath)
    out = []
    if not d.is_dir():
        return out
    for f in sorted(d.iterdir(), reverse=True):
        if f.is_file() and f.suffix.lower() in (".txt", ".md"):
            try:
                body = f.read_text(encoding="utf-8", errors="ignore").strip()
            except OSError:
                body = ""
            out.append({
                "file": f.name,
                "body": body[:1200],
                "mtime": datetime.fromtimestamp(f.stat().st_mtime).strftime("%m/%d %H:%M"),
            })
    return out


def open_local(dirkey, name):
    """在檔案總管/對應軟體開啟檔案；僅允許設定資料夾內的檔案。"""
    cfg = get_config()
    base = resolve_dir(cfg[dirkey]).resolve()
    target = (base / name).resolve()
    if base not in target.parents and target != base:
        return {"ok": False, "error": "路徑不在允許的資料夾內"}
    if not target.exists():
        return {"ok": False, "error": f"檔案不存在：{name}"}
    try:
        if sys.platform == "win32":
            os.startfile(str(target))  # noqa: S606
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(target)])
        else:
            subprocess.Popen(["xdg-open", str(target)])
        return {"ok": True}
    except OSError as e:
        return {"ok": False, "error": f"無法開啟（可能未安裝對應軟體）：{e}"}


# ── Request 狀態機 ──────────────────────────────────────
def db_requests():
    return load_json(DATA / "requests.json", {"seq": 1, "requests": []})


def db_history():
    return load_json(DATA / "history.json", {})


def bump_version(ver):
    """v3.0-r08 → v3.1-r09（minor 進版、流水號 +1）"""
    m = VER_RE.search(ver or "")
    if not m:
        return "v1.0-r01"
    major, minor, r = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return f"v{major}.{minor + 1}-r{r + 1:02d}"


def latest_pdf_for(code, pdf_dir):
    """找該圖號最新的正式版 PDF（排除 pending）"""
    d = resolve_dir(pdf_dir)
    if not d.is_dir():
        return None
    cands = [f for f in d.iterdir()
             if f.is_file() and f.name.startswith(code) and "pending" not in f.name.lower()]
    return max(cands, key=lambda f: f.stat().st_mtime) if cands else None


def transition(req_id, action, actor):
    cfg = get_config()
    db = db_requests()
    req = next((r for r in db["requests"] if r["id"] == req_id), None)
    if not req:
        return {"ok": False, "error": "Request 不存在"}
    hist = db_history()
    code = req["drawing"]
    msg = ""

    if action == "accept" and req["status"] == "red":
        req["localCopy"] = True
        req["log"].append({"t": now_str(), "e": f"{actor} 接受任務，建立本地副本（≈ git clone）"})
        cad = next((f for f in scan_files(cfg["cadDir"], {".dwg", ".rvt", ".dxf"}) if f["code"] == code), None)
        opened = open_local("cadDir", cad["name"]) if cad else {"ok": False}
        msg = f"已接受 {req_id}" + ("，並開啟 CAD 檔案" if opened.get("ok") else "（未能自動開啟 CAD 檔）")

    elif action == "submit" and req["status"] == "red":
        req["status"] = "yellow"
        src = latest_pdf_for(code, cfg["pdfDir"])
        pending_name = None
        if src:
            pending_name = f"{code}_pending_{req_id}.pdf"
            shutil.copy2(src, src.parent / pending_name)
        req["pendingPdf"] = pending_name
        req["log"].append({"t": now_str(), "e": f"{actor} 完成提交，自動出圖 {pending_name or '(無來源 PDF)'}（≈ git push）→ 待 {req['requester']} 確認"})
        msg = f"{req_id} 已提交 → 🟡 待 {req['requester']} 確認"

    elif action == "confirm" and req["status"] == "yellow":
        req["status"] = "green"
        entry = hist.setdefault(code, {"name": code, "history": []})
        old_ver = entry["history"][0]["ver"] if entry["history"] else None
        new_ver = bump_version(old_ver)
        pdf_dir = resolve_dir(cfg["pdfDir"])
        src = latest_pdf_for(code, cfg["pdfDir"])
        new_pdf = None
        if src:
            new_pdf = f"{code}_{new_ver}.pdf"
            shutil.copy2(src, pdf_dir / new_pdf)
        if req.get("pendingPdf"):
            try:
                (pdf_dir / req["pendingPdf"]).unlink(missing_ok=True)
            except OSError:
                pass
        entry["history"].insert(0, {
            "ver": new_ver,
            "date": now_str().split(" ")[0],
            "note": req["title"],
            "designer": req["designer"],
            "approver": req["requester"],
            "req": req_id,
        })
        save_json(DATA / "history.json", hist)
        req["log"].append({"t": now_str(), "e": f"{req['requester']} 確認 → 正式進版 {new_ver}（≈ merge），已通知所有人舊版作廢"})
        msg = f"🟢 {code} 正式進版 {new_ver}" + (f"，已產生 {new_pdf}" if new_pdf else "")

    else:
        return {"ok": False, "error": f"狀態 {req['status']} 不允許動作 {action}"}

    save_json(DATA / "requests.json", db)
    return {"ok": True, "message": msg}


def create_request(payload):
    db = db_requests()
    rid = f"REQ-{db['seq']:03d}"
    db["seq"] += 1
    cfg = get_config()
    req = {
        "id": rid,
        "status": "red",
        "drawing": payload.get("drawing") or "?",
        "title": payload.get("title") or "(未命名 Request)",
        "source": payload.get("source") or {"type": "manual", "icon": "✍️", "from": cfg["currentUser"], "quote": ""},
        "requester": payload.get("requester") or cfg["currentUser"],
        "designer": payload.get("designer") or cfg["currentUser"],
        "due": payload.get("due") or "",
        "refs": payload.get("refs") or [],
        "pos": payload.get("pos") or {"x": 180, "y": 400},
        "marker": chr(ord("A") + (db["seq"] % 24)),
        "log": [{"t": now_str(), "e": "從" + payload.get("sourceLabel", "收件匣") + "萃取建立 Request"}],
        "localCopy": False,
    }
    db["requests"].insert(0, req)
    save_json(DATA / "requests.json", db)
    return {"ok": True, "request": req}


# ── HTTP handler ────────────────────────────────────────
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(WEB), **kw)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def do_GET(self):
        if self.path.split("?")[0] == "/api/state":
            cfg = get_config()
            self._json({
                "config": cfg,
                "requests": db_requests()["requests"],
                "history": db_history(),
                "files": {
                    "cad": scan_files(cfg["cadDir"], {".dwg", ".rvt", ".dxf"}),
                    "pdf": scan_files(cfg["pdfDir"], {".pdf"}),
                },
                "inbox": scan_inbox(cfg["inboxDir"]),
            })
        else:
            super().do_GET()

    def do_POST(self):
        path = self.path.rstrip("/")
        body = self._body()
        cfg = get_config()

        if path == "/api/requests":
            self._json(create_request(body))
        elif m := re.match(r"^/api/requests/(REQ-\d+)/(accept|submit|confirm)$", path):
            self._json(transition(m.group(1), m.group(2), body.get("actor") or cfg["currentUser"]))
        elif path == "/api/open":
            dirkey = {"cad": "cadDir", "pdf": "pdfDir", "inbox": "inboxDir"}.get(body.get("type"))
            if not dirkey:
                self._json({"ok": False, "error": "type 需為 cad/pdf/inbox"}, 400)
            else:
                self._json(open_local(dirkey, body.get("name", "")))
        elif path == "/api/config":
            allowed = {k: v for k, v in body.items() if k in DEFAULT_CONFIG}
            save_json(CONFIG_PATH, {**get_config(), **allowed})
            self._json({"ok": True, "config": get_config()})
        else:
            self._json({"ok": False, "error": "unknown endpoint"}, 404)


def main():
    port = get_config()["port"]
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"ArchiHub server → http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

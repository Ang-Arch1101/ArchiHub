# -*- coding: utf-8 -*-
"""ArchiHub 後端 — 工程圖面的 GitHub
零外部依賴（Python 3.10+ 標準庫），負責：
  1. 多專案管理：每個專案有自己的資料夾（CAD／PDF／信件／筆記）與任務資料
  2. Request 狀態機：紅(待處理) → 黃(待確認) → 綠(已進版)
  3. 進版流水號管理，confirm 時自動複製產生新版 PDF
  4. 呼叫作業系統開啟實際檔案（前往任務）
  5. 人工修正記錄（標註位置等）→ data/<專案>/corrections.jsonl 訓練資料
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
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
DATA = ROOT / "data"
SEED = ROOT / "sample" / "seed"
CONFIG_PATH = ROOT / "config.json"

# 圖號樣式：檔名中任一處的「1~2 個大寫字母-3 位數字」（前後不能連著英數字）
DWG_CODE = re.compile(r"(?<![A-Z0-9])([A-Z]{1,2}-\d{3})(?!\d)")
VER_RE = re.compile(r"v(\d+)\.(\d+)-r(\d+)")

DEFAULT_PROJECT = {
    "id": "928816",
    "name": "928816 · 竹北廠區新建工程",
    "cadDir": "sample/01_作業檔",
    "pdfDir": "sample/02_出圖檔",
    "mailDir": "sample/inbox/mail",
    "noteDir": "sample/inbox/notes",
}
DEFAULT_CONFIG = {
    "currentUser": "阿勳",
    "port": 8734,
    "currentProject": DEFAULT_PROJECT["id"],
    "projects": [DEFAULT_PROJECT],
}
PROJECT_FIELDS = ("id", "name", "cadDir", "pdfDir", "mailDir", "noteDir")
SOURCE_DIRS = (("mailDir", "mail"), ("noteDir", "note"))  # Request 來源：信件 / 筆記


# ── 存取 ────────────────────────────────────────────────
def load_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def save_json(path, obj):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def append_jsonl(path, obj):
    """累積訓練資料：一行一筆 JSON（人工修正記錄）"""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


def get_config():
    raw = load_json(CONFIG_PATH, {})
    if raw and "projects" not in raw:
        # 舊版扁平設定（單專案）→ 自動升級為多專案格式
        proj = {**DEFAULT_PROJECT}
        if raw.get("cadDir"):
            proj["cadDir"] = raw["cadDir"]
        if raw.get("pdfDir"):
            proj["pdfDir"] = raw["pdfDir"]
        if raw.get("inboxDir"):  # 舊的單一收件匣 → 當作信件來源
            proj["mailDir"] = raw["inboxDir"]
        raw = {
            "currentUser": raw.get("currentUser", DEFAULT_CONFIG["currentUser"]),
            "port": raw.get("port", DEFAULT_CONFIG["port"]),
            "currentProject": proj["id"],
            "projects": [proj],
        }
        save_json(CONFIG_PATH, raw)
    cfg = {**DEFAULT_CONFIG, **raw}
    if not cfg["projects"]:
        cfg["projects"] = [DEFAULT_PROJECT]
    return cfg


def cur_project(cfg=None):
    cfg = cfg or get_config()
    for p in cfg["projects"]:
        if p["id"] == cfg.get("currentProject"):
            return p
    return cfg["projects"][0]


def resolve_dir(rel):
    p = Path(rel or "")
    return p if p.is_absolute() else ROOT / p


def now_str():
    return datetime.now().strftime("%m/%d %H:%M")


# ── 專案資料（每個專案一個資料夾；預設專案首次啟動從 seed 建立） ──
def proj_data_dir(pid):
    d = DATA / pid
    if not (d / "requests.json").exists():
        d.mkdir(parents=True, exist_ok=True)
        if pid == DEFAULT_PROJECT["id"] and (SEED / "requests.json").exists():
            for f in ("requests.json", "history.json"):
                if (SEED / f).exists():
                    shutil.copy2(SEED / f, d / f)
        else:
            save_json(d / "requests.json", {"seq": 1, "requests": []})
            save_json(d / "history.json", {})
    return d


def db_requests(pid):
    return load_json(proj_data_dir(pid) / "requests.json", {"seq": 1, "requests": []})


def db_history(pid):
    return load_json(proj_data_dir(pid) / "history.json", {})


def migrate_root_data():
    """舊版把資料放 data/ 根目錄 → 搬進預設專案資料夾"""
    pid = DEFAULT_PROJECT["id"]
    if (DATA / "requests.json").exists() and not (DATA / pid / "requests.json").exists():
        (DATA / pid).mkdir(parents=True, exist_ok=True)
        for f in ("requests.json", "history.json", "corrections.jsonl"):
            if (DATA / f).exists():
                (DATA / f).rename(DATA / pid / f)


# ── 資料夾掃描 ──────────────────────────────────────────
def scan_files(dirpath, exts):
    d = resolve_dir(dirpath)
    out = []
    if not d.is_dir():
        return out
    for f in sorted(d.iterdir()):
        if f.is_file() and f.suffix.lower() in exts:
            m = DWG_CODE.search(f.name)
            out.append({
                "name": f.name,
                "code": m.group(1) if m else None,
                "size": f.stat().st_size,
                "mtime": datetime.fromtimestamp(f.stat().st_mtime).strftime("%m/%d %H:%M"),
            })
    return out


def scan_sources(proj):
    """收件匣：信件資料夾 + 筆記資料夾，各自標記來源型態"""
    out = []
    for dirkey, stype in SOURCE_DIRS:
        d = resolve_dir(proj.get(dirkey, ""))
        if not d.is_dir():
            continue
        for f in d.iterdir():
            if f.is_file() and f.suffix.lower() in (".txt", ".md"):
                try:
                    body = f.read_text(encoding="utf-8", errors="ignore").strip()
                except OSError:
                    body = ""
                out.append({
                    "file": f.name,
                    "src": stype,
                    "body": body[:1200],
                    "mtimeRaw": f.stat().st_mtime,
                    "mtime": datetime.fromtimestamp(f.stat().st_mtime).strftime("%m/%d %H:%M"),
                })
    out.sort(key=lambda m: m["mtimeRaw"], reverse=True)
    for m in out:
        m.pop("mtimeRaw", None)
    return out


DIR_KEYS = {"cad": "cadDir", "pdf": "pdfDir", "mail": "mailDir", "note": "noteDir"}


def open_local(proj, dirtype, name):
    """在檔案總管/對應軟體開啟檔案；僅允許該專案設定資料夾內的檔案。"""
    dirkey = DIR_KEYS.get(dirtype)
    if not dirkey:
        return {"ok": False, "error": "type 需為 cad/pdf/mail/note"}
    base = resolve_dir(proj.get(dirkey, "")).resolve()
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
    if not d.is_dir() or not code:
        return None
    cands = []
    for f in d.iterdir():
        if not f.is_file() or f.suffix.lower() != ".pdf" or "pending" in f.name.lower():
            continue
        m = DWG_CODE.search(f.name)
        if m and m.group(1) == code:
            cands.append(f)
    return max(cands, key=lambda f: f.stat().st_mtime) if cands else None


def transition(pid, req_id, action, actor):
    proj = cur_project()
    db = db_requests(pid)
    req = next((r for r in db["requests"] if r["id"] == req_id), None)
    if not req:
        return {"ok": False, "error": "Request 不存在"}
    hist = db_history(pid)
    code = req["drawing"]
    msg = ""

    if action == "accept" and req["status"] == "red":
        req["localCopy"] = True
        req["log"].append({"t": now_str(), "e": f"{actor} 接受任務，建立本地副本（≈ git clone）"})
        cad = next((f for f in scan_files(proj["cadDir"], {".dwg", ".rvt", ".dxf"}) if f["code"] == code), None)
        opened = open_local(proj, "cad", cad["name"]) if cad else {"ok": False}
        msg = f"已接受 {req_id}" + ("，並開啟 CAD 檔案" if opened.get("ok") else "（未能自動開啟 CAD 檔）")

    elif action == "submit" and req["status"] == "red":
        req["status"] = "yellow"
        src = latest_pdf_for(code, proj["pdfDir"])
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
        pdf_dir = resolve_dir(proj["pdfDir"])
        src = latest_pdf_for(code, proj["pdfDir"])
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
        save_json(proj_data_dir(pid) / "history.json", hist)
        req["log"].append({"t": now_str(), "e": f"{req['requester']} 確認 → 正式進版 {new_ver}（≈ merge），已通知所有人舊版作廢"})
        msg = f"🟢 {code} 正式進版 {new_ver}" + (f"，已產生 {new_pdf}" if new_pdf else "")

    else:
        return {"ok": False, "error": f"狀態 {req['status']} 不允許動作 {action}"}

    save_json(proj_data_dir(pid) / "requests.json", db)
    return {"ok": True, "message": msg}


def create_request(pid, payload):
    db = db_requests(pid)
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
        "pos": payload.get("pos") or {"nx": 0.12, "ny": 0.85},
        "marker": chr(ord("A") + (db["seq"] % 24)),
        "log": [{"t": now_str(), "e": "從" + payload.get("sourceLabel", "收件匣") + "萃取建立 Request"}],
        "localCopy": False,
    }
    db["requests"].insert(0, req)
    save_json(proj_data_dir(pid) / "requests.json", db)
    return {"ok": True, "request": req}


def save_project(body):
    """新增或更新專案設定"""
    cfg = get_config()
    pid = (body.get("id") or "").strip()
    fields = {k: (body.get(k) or "").strip() for k in ("name", "cadDir", "pdfDir", "mailDir", "noteDir")}
    if not fields["name"]:
        return {"ok": False, "error": "專案名稱不能為空"}
    if pid:  # 更新既有
        proj = next((p for p in cfg["projects"] if p["id"] == pid), None)
        if not proj:
            return {"ok": False, "error": f"專案 {pid} 不存在"}
        proj.update({k: v for k, v in fields.items() if v or k == "name"})
    else:    # 新增
        base = re.sub(r"[^\w\-]", "", fields["name"].split("·")[0].split(" ")[0]) or "proj"
        pid = base
        n = 1
        while any(p["id"] == pid for p in cfg["projects"]):
            n += 1
            pid = f"{base}-{n}"
        cfg["projects"].append({"id": pid, **fields})
        cfg["currentProject"] = pid
    save_json(CONFIG_PATH, {k: cfg[k] for k in ("currentUser", "port", "currentProject", "projects")})
    return {"ok": True, "id": pid, "config": get_config()}


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
        parsed = urlparse(self.path)
        if parsed.path == "/api/pdffile":
            # 串流 PDF 檔給前端 pdf.js 渲染（限出圖資料夾內）
            name = (parse_qs(parsed.query).get("name") or [""])[0]
            proj = cur_project()
            base = resolve_dir(proj["pdfDir"]).resolve()
            target = (base / name).resolve()
            if (base not in target.parents) or not target.is_file():
                self._json({"ok": False, "error": "PDF 不存在或路徑不允許"}, 404)
                return
            data = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(data)
            return
        if parsed.path == "/api/state":
            cfg = get_config()
            proj = cur_project(cfg)
            self._json({
                "config": {k: cfg[k] for k in ("currentUser", "port", "currentProject", "projects")},
                "project": proj,
                "requests": db_requests(proj["id"])["requests"],
                "history": db_history(proj["id"]),
                "files": {
                    "cad": scan_files(proj["cadDir"], {".dwg", ".rvt", ".dxf"}),
                    "pdf": scan_files(proj["pdfDir"], {".pdf"}),
                },
                "inbox": scan_sources(proj),
            })
        else:
            super().do_GET()

    def do_POST(self):
        path = self.path.rstrip("/")
        body = self._body()
        cfg = get_config()
        proj = cur_project(cfg)
        pid = proj["id"]

        if path == "/api/requests":
            self._json(create_request(pid, body))
        elif m := re.match(r"^/api/requests/(REQ-\d+)/(accept|submit|confirm)$", path):
            self._json(transition(pid, m.group(1), m.group(2), body.get("actor") or cfg["currentUser"]))
        elif m := re.match(r"^/api/requests/(REQ-\d+)/pos$", path):
            # 更新標註位置（正規化座標 0~1），並記錄人工修正 → 訓練資料
            db = db_requests(pid)
            req = next((r for r in db["requests"] if r["id"] == m.group(1)), None)
            pos = body.get("pos") or {}
            if not req or "nx" not in pos:
                self._json({"ok": False, "error": "缺少 request 或座標"}, 400)
            else:
                old = req.get("pos")
                req["pos"] = {"nx": round(float(pos["nx"]), 4), "ny": round(float(pos["ny"]), 4)}
                save_json(proj_data_dir(pid) / "requests.json", db)
                append_jsonl(proj_data_dir(pid) / "corrections.jsonl", {
                    "ts": datetime.now().isoformat(timespec="seconds"),
                    "kind": body.get("kind") or "marker_move",
                    "req": req["id"], "drawing": req["drawing"], "text": req["title"],
                    "from": old, "to": req["pos"], "user": body.get("actor") or cfg["currentUser"],
                })
                self._json({"ok": True, "pos": req["pos"]})
        elif path == "/api/corrections":
            append_jsonl(proj_data_dir(pid) / "corrections.jsonl", {
                "ts": datetime.now().isoformat(timespec="seconds"),
                **{k: body[k] for k in body if k != "ts"},
            })
            self._json({"ok": True})
        elif path == "/api/open":
            self._json(open_local(proj, body.get("type", ""), body.get("name", "")))
        elif path == "/api/config":
            allowed = {k: v for k, v in body.items() if k in ("currentUser", "port")}
            save_json(CONFIG_PATH, {**{k: cfg[k] for k in ("currentUser", "port", "currentProject", "projects")}, **allowed})
            self._json({"ok": True, "config": get_config()})
        elif path == "/api/project/switch":
            target = body.get("id")
            if not any(p["id"] == target for p in cfg["projects"]):
                self._json({"ok": False, "error": f"專案 {target} 不存在"}, 400)
            else:
                cfg["currentProject"] = target
                save_json(CONFIG_PATH, {k: cfg[k] for k in ("currentUser", "port", "currentProject", "projects")})
                self._json({"ok": True})
        elif path == "/api/project/save":
            self._json(save_project(body))
        else:
            self._json({"ok": False, "error": "unknown endpoint"}, 404)


def main():
    migrate_root_data()
    port = get_config()["port"]
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"ArchiHub server → http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

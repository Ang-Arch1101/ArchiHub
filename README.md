# ArchiHub 📐 — 工程圖面的 GitHub

把 Git 的協作邏輯搬到工程圖面管理：**多來源修改要求 → 結構化 Request → 對應圖面 → 派工 → 版本進版與通知**。

> 邊界：只做「溝通資訊 → 圖面」這一段，不碰改圖本身。詳見 [docs/2026-07-18-討論紀錄.md](docs/2026-07-18-討論紀錄.md)。

## 架構對照

| GitHub | ArchiHub |
|---|---|
| Repository | 中央檔案庫（CAD 源檔 + PDF 出圖） |
| Issue / Pull Request | 圖面修改 Request（🔴 待處理） |
| Clone / Pull | 「前往修改」→ 建立本地副本並開啟 CAD 檔 |
| Commit / Push | 「完成並提交」→ 自動出 pending PDF（🟡 待確認） |
| Review / Merge | Requester 確認 → 正式進版新流水號 PDF（🟢 已進版） |
| Commit history | 進版流水號 + designer / approver 記錄 |

## 環境需求

- **Python 3.10+**（僅用標準庫，**不需安裝任何套件**）
- Windows / macOS / Linux 皆可（開啟檔案分別用 `os.startfile` / `open` / `xdg-open`）

## 快速開始

```bash
python server.py
# → http://localhost:8734
```

預設讀取 `sample/` 內的示範資料夾，開箱即可操作完整流程。

## 對接你自己的本地資料夾

方法一：介面右上角「⚙ 設定」直接修改路徑。
方法二：編輯 `config.json`：

```json
{
  "currentUser": "你的名字",
  "cadDir": "D:/案件/928816/01_作業檔",
  "pdfDir": "D:/案件/928816/02_出圖檔",
  "inboxDir": "D:/案件/928816/inbox",
  "port": 8734
}
```

- `cadDir`：CAD／Revit 作業檔資料夾（`.dwg` `.rvt` `.dxf`）
- `pdfDir`：正式出圖 PDF 資料夾（進版時自動在此產生新流水號 PDF）
- `inboxDir`：收件匣資料夾——把 Email 轉存、會議記錄、工地筆記存成 `.txt`/`.md` 丟進來，介面即可萃取成 Request
- `currentUser`：決定「🔧 待辦作業」（我是 Designer）與「👁 待我確認」（我是 Requester）兩個頁籤的歸屬

## 功能現況

- 📥 **收件匣**：讀取本地資料夾的文字檔 → 萃取（目前為規則式解析，欄位可人工修改）→ 建立 Request
- 🗂 **工作台**：
  - 左欄三頁籤：**待辦作業**（等我改）／**待我確認**（等我核）／全部
  - 中間圖面示意 + revision cloud 標記（顏色隨狀態連動）+ 版本歷史流水號
  - 右欄 Request 詳情，依身分顯示對應動作按鈕
- 🔴→🟡→🟢 **狀態機**（後端執行）：接受任務會直接開啟 CAD 檔；提交產生 `_pending_` PDF；確認後自動複製產生新版流水號 PDF、刪除 pending
- 📁 **檔案庫**：即時列出兩個資料夾內容，點擊用預設軟體開啟

## Roadmap

- [ ] AI 萃取串接（取代規則式解析；語意對應圖號、圖上位置）
- [ ] Email / LINE 等來源自動接入
- [ ] 實際 PDF/CAD 圖面預覽（取代 SVG 示意圖）
- [ ] Request 對應到圖上座標的自動標註與人工修正回饋（訓練資料）
- [ ] 多人協作（目前為單機單人，資料存 `data/*.json`）
- [ ] 參考資料自動附掛（法規、標準圖、技術規範）

## 專案結構

```
server.py        # 後端（Python 標準庫，零依賴）
config.json      # 資料夾路徑與使用者設定
web/             # 前端（原生 HTML/CSS/JS）
data/            # Request 與版本歷史（JSON）
sample/          # 示範資料夾（CAD 假檔、PDF、收件匣文字檔）
prototype/       # 最初的純前端互動原型（保留參考）
docs/            # 概念討論紀錄
```

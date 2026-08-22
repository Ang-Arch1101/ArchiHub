# ArchiHub 📐 — 工程圖面的 GitHub

> 🔗 [查看 ArchiHub 專案介紹網站](https://ang-arch1101.github.io/ArchiHub/)

把 Git 的協作邏輯搬到工程圖面管理：**多來源修改要求 → 結構化 Request → 對應圖面 → 派工 → 版本進版與通知**。

> 邊界：只做「溝通資訊 → 圖面」這一段，不碰改圖本身。詳見 [docs/01.meetings/2026-07-18-討論紀錄.md](docs/01.meetings/2026-07-18-討論紀錄.md)。

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

預設讀取 `sample/` 內的示範資料夾，開箱即可操作完整流程。首次啟動會自動建立 `config.json`（個人設定）與 `data/`（runtime 資料）——兩者皆不進版控，範本見 [config.example.json](config.example.json)。

## 多專案與資料夾設定

左上角下拉選單可**切換專案／新增專案**，每個專案有自己的資料夾與任務資料（存於 `data/<專案id>/`）。

右上角「⚙ 設定」分三區：

| 分區 | 欄位 | 說明 |
|---|---|---|
| 👤 身分 | 我的名字 | 決定「🔧 待辦作業」（我是 Designer）與「👁 待我確認」（我是 Requester）的歸屬 |
| 📁 專案資料夾 | 專案名稱、CAD 作業檔、PDF 出圖 | PDF 檔名需含圖號（如 `A-201`），系統靠圖號對應圖面 |
| 📨 Request 來源 | 📧 信件資料夾、📝 筆記資料夾 | 各放 `.txt`/`.md`：信件＝Email 轉存；筆記＝口頭交代、工地手記 |

路徑可為絕對路徑（`D:\案件\928816\CAD`）或相對於 ArchiHub 的路徑。舊版單一收件匣設定會自動升級為新格式（原 inboxDir 歸入信件來源）。

## 功能現況

- 📥 **收件匣**：讀取 📧 信件與 📝 筆記兩個來源資料夾的文字檔 → 萃取（目前為規則式解析，欄位可人工修改）→ 建立 Request
- 🗂 **工作台**：
  - 左欄三頁籤：**待辦作業**（等我改）／**待我確認**（等我核）／全部
  - 中間為**真實 PDF 圖面**（pdf.js 離線打包，讀出圖資料夾最新版）+ revision cloud 標記（顏色隨狀態連動）+ 版本歷史流水號
  - 標註可**拖曳修正位置**、或按「重新定位」在圖上點新位置；**每次人工修正都記錄到 `data/corrections.jsonl`**——這是未來 AI 定位模型的訓練資料（Google 紅綠燈驗證的概念）
  - 右欄 Request 詳情，依身分顯示對應動作按鈕
- 🔴→🟡→🟢 **狀態機**（後端執行）：接受任務會直接開啟 CAD 檔；提交產生 `_pending_` PDF；確認後自動複製產生新版流水號 PDF、刪除 pending
- ↩ **退回重修**（🟡→🔴）：Requester 檢查 pending 不符時可退回——在圖上點出**問題位置**（紫色 ↩ 標記）＋填寫退回原因，交回 Designer 繼續改，往返多輪直到確認才進版；每輪退回都記入 `corrections.jsonl`（未來「AI 預判會不會被打回」的訓練資料）
- ⛔ **任務拒絕**（🔴）：Designer 認為需求不清/不合理時可拒絕，並**一鍵開啟回信頁面**（`mailto:` 帶入原始需求引文）向 Requester 釐清；來源為現場筆記/口頭而無 email 時自動降級提示。釐清後接受任務即解除
- 📁 **檔案庫**：即時列出兩個資料夾內容，點擊用預設軟體開啟

## Roadmap

- [x] 實際 PDF 圖面預覽（pdf.js 離線打包）
- [x] 標註拖曳/點擊定位 + 人工修正記錄（`data/corrections.jsonl` 訓練資料閉環）
- [ ] AI 萃取串接（可切換 provider：預設本地 Ollama 免費，可升級 Claude API；含公司詞彙表 glossary、few-shot 修正案例回饋）
- [ ] Email 接入：專用信箱 + Gmail 篩選器自動轉寄（IMAP 輪詢，標準庫）
- [ ] 出圖資料夾監看：偵測新 PDF 自動掛到進行中 Request
- [ ] 內網多人版（server 綁區網 + 登入，資料夾指向公司共用磁碟）
- [ ] LINE Messaging API bot（群組建單、進版推播；LINE Notify 已停用不可用）
- [ ] 參考資料自動附掛（法規、標準圖、技術規範）
- [ ] 每週摘要報表（進版清單、逾期 Request）給主管/業主

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

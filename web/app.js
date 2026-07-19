/* ArchiHub 前端 — 對接本地後端 API（server.py） */
'use strict';

let S = { config: {}, requests: [], history: {}, files: { cad: [], pdf: [] }, inbox: [] };
let curTab = 'todo', curReq = null, curDwg = null;
let extractOpen = null; // 收件匣展開中的萃取表單（避免輪詢時蓋掉）

const statusName = { red: '🔴 待處理', yellow: '🟡 待確認', green: '🟢 已進版' };
const statusStroke = { red: '#d1242f', yellow: '#d4a72c', green: '#1a7f37' };

/* ═══ API ═══ */
async function api(path, opts) {
  const res = await fetch(path, opts ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts) } : undefined);
  return res.json();
}
async function loadState(first = false) {
  try {
    S = await api('/api/state');
  } catch (e) { toast('⚠ 無法連線後端，請確認 server.py 執行中'); return; }
  if (!curDwg || !(curDwg in S.history)) curDwg = Object.keys(S.history)[0] || null;
  renderAll(first);
}

/* ═══ 視圖切換 ═══ */
function switchView(v) {
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  document.getElementById('view-' + v).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(x => x.classList.toggle('active', x.dataset.view === v));
}
function openModal(id) {
  if (id === 'settings-modal') {
    const c = S.config;
    document.getElementById('cfg-user').value = c.currentUser || '';
    document.getElementById('cfg-cad').value = c.cadDir || '';
    document.getElementById('cfg-pdf').value = c.pdfDir || '';
    document.getElementById('cfg-inbox').value = c.inboxDir || '';
  }
  document.getElementById(id).classList.add('show');
}
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
async function saveConfig() {
  const r = await api('/api/config', {
    currentUser: document.getElementById('cfg-user').value.trim(),
    cadDir: document.getElementById('cfg-cad').value.trim(),
    pdfDir: document.getElementById('cfg-pdf').value.trim(),
    inboxDir: document.getElementById('cfg-inbox').value.trim(),
  });
  if (r.ok) { toast('⚙ 設定已儲存'); closeModal('settings-modal'); loadState(); }
}

/* ═══ 左欄頁籤：待辦 / 待我確認 / 全部 ═══ */
const tabDesc = {
  todo: '我是 Designer，等我動手修改的 Request',
  review: '我發出的 Request，對方已提交，等我檢查確認進版',
  all: '本專案全部 Request（含已結案）',
};
function me() { return S.config.currentUser; }
function tabFilter(t) {
  if (t === 'todo') return S.requests.filter(r => r.designer === me() && r.status === 'red');
  if (t === 'review') return S.requests.filter(r => r.requester === me() && r.status === 'yellow');
  return S.requests;
}
function setTab(t) {
  curTab = t;
  document.querySelectorAll('.side-tab').forEach(x => x.classList.toggle('active', x.dataset.t === t));
  document.getElementById('tab-desc').textContent = tabDesc[t];
  renderList();
}
function renderList() {
  const el = document.getElementById('req-list');
  document.getElementById('cnt-todo').textContent = tabFilter('todo').length;
  document.getElementById('cnt-review').textContent = tabFilter('review').length;
  const list = tabFilter(curTab);
  if (!list.length) { el.innerHTML = '<div class="list-empty">此頁籤目前沒有項目 🎉</div>'; return; }
  el.innerHTML = list.map(r => {
    const role = r.designer === me() ? '<span class="role-chip designer">我修改</span>'
      : r.requester === me() ? '<span class="role-chip requester">我確認</span>' : '';
    return `
    <div class="req-card ${curReq === r.id ? 'selected' : ''}" onclick="selectReq('${r.id}')">
      <div class="req-top"><span class="light ${r.status}"></span><span class="req-id">${r.id}</span>${role}</div>
      <div class="req-title">${r.title}</div>
      <div class="req-meta"><span class="tag">${r.drawing}</span><span>${r.source.icon || '✉'} ${(r.source.from || '').split('〈')[0]}</span>${r.due ? `<span>⏱ ${r.due}</span>` : ''}</div>
    </div>`;
  }).join('');
}

function selectReq(id) {
  curReq = id;
  const r = S.requests.find(x => x.id === id);
  if (r && r.drawing in S.history) curDwg = r.drawing;
  renderList(); renderDetail(); renderSheet(); renderHist(); renderDwgTabs();
  setTimeout(() => {
    const m = document.querySelector(`.marker[data-req="${id}"]`);
    if (m) m.classList.add('focus');
  }, 50);
}

/* ═══ 詳情與動作 ═══ */
function renderDetail() {
  const el = document.getElementById('detail');
  const r = S.requests.find(x => x.id === curReq);
  if (!r) { el.innerHTML = '<div class="detail-empty">← 點選左側任一 Request<br>查看詳情與圖面對應位置</div>'; return; }
  const iAmDesigner = r.designer === me(), iAmRequester = r.requester === me();
  const cadFile = S.files.cad.find(f => f.code === r.drawing);
  let actions = '';
  if (r.status === 'red') {
    if (iAmDesigner) {
      actions = r.localCopy
        ? `<div class="local-note">💾 本地副本編輯中${cadFile ? `：<span style="font-family:var(--mono)">${cadFile.name}</span>` : ''}</div>
           ${cadFile ? `<button class="btn btn-ghost" onclick="openFile('cad','${cadFile.name}')">📂 再次開啟 CAD 檔</button>` : ''}
           <button class="btn btn-warn" onclick="doAction('${r.id}','submit')">⬆ 完成並提交（自動出 PDF）</button>`
        : `<button class="btn btn-accent" onclick="doAction('${r.id}','accept')">▶ 接受任務・前往修改（開啟 CAD 本地副本）</button>`;
    } else {
      actions = `<div class="local-note wait">⏳ 等待 ${r.designer} 接受並修改</div>`;
    }
  } else if (r.status === 'yellow') {
    if (iAmRequester) {
      actions = `${r.pendingPdf ? `<button class="btn btn-ghost" onclick="openFile('pdf','${r.pendingPdf}')">🧾 檢視提交的 PDF（${r.pendingPdf}）</button>` : ''}
        <button class="btn btn-primary" onclick="doAction('${r.id}','confirm')">✓ 確認符合要求 → 正式進版</button>`;
    } else {
      actions = `<div class="local-note wait">⏳ Pending — 等待 ${r.requester} 檢查確認</div>`;
    }
  } else {
    actions = `<div class="local-note ok">✅ 已正式進版並通知所有人，本 Request 結案</div>`;
  }
  el.innerHTML = `
    <div class="detail">
      <div class="status-banner ${r.status}"><span class="light ${r.status}"></span>${statusName[r.status]}</div>
      <span class="req-id">${r.id}</span>
      <h2>${r.title}</h2>
      <div class="source-box">
        <div class="src-head">${r.source.icon || '✉'} 來源：${r.source.from || '—'}</div>
        ${r.source.quote ? `<blockquote>「${r.source.quote}」</blockquote>` : ''}
      </div>
      <dl class="kv">
        <dt>對應圖面</dt><dd><a onclick="setDwg('${r.drawing}')">${r.drawing} ${(S.history[r.drawing] || {}).name || ''}</a></dd>
        <dt>Requester</dt><dd>${r.requester}${r.requester === me() ? '（我）' : ''}</dd>
        <dt>Designer</dt><dd>${r.designer}${r.designer === me() ? '（我）' : ''}</dd>
        <dt>回覆期限</dt><dd>${r.due || '—'}</dd>
        <dt>現行版本</dt><dd style="font-family:var(--mono)">${(((S.history[r.drawing] || {}).history || [])[0] || {}).ver || '—'}</dd>
      </dl>
      ${(r.refs || []).length ? `<div class="refs">
        <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px;">📎 參考資料</div>
        ${r.refs.map(f => `<div class="ref" onclick="toast('🔗 （示意）開啟參考資料')">${f}</div>`).join('')}
      </div>` : ''}
      ${actions}
      <div class="timeline">
        <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:4px;">歷程</div>
        ${(r.log || []).map(l => `<div class="tl"><b>${l.t}</b><span>${l.e}</span></div>`).join('')}
      </div>
    </div>`;
}
async function doAction(id, action) {
  const r = await api(`/api/requests/${id}/${action}`, { actor: me() });
  toast(r.ok ? r.message : '⚠ ' + r.error);
  if (action === 'confirm' && r.ok) setTimeout(() => toast('📢 已通知專案全員：中央檔已更新，舊版作廢'), 700);
  await loadState();
}
async function openFile(type, name) {
  const r = await api('/api/open', { type, name });
  toast(r.ok ? `📂 已開啟 ${name}` : '⚠ ' + r.error);
}

/* ═══ 圖面 viewer（SVG 示意；實圖預覽為後續目標） ═══ */
function setDwg(code) {
  curDwg = code;
  renderSheet(); renderHist(); renderDwgTabs(); switchView('work');
}
function renderDwgTabs() {
  const el = document.getElementById('dwg-tabs');
  const codes = Object.keys(S.history);
  const d = S.history[curDwg] || { name: '', history: [] };
  const locked = S.requests.some(r => r.drawing === curDwg && r.localCopy && r.status !== 'green');
  el.innerHTML = codes.map(c =>
    `<button class="dwg-tab ${c === curDwg ? 'active' : ''}" onclick="setDwg('${c}')">${c}</button>`).join('')
    + `<span class="ver-pill">📄 ${d.name || curDwg} · ${(d.history[0] || {}).ver || '—'}${locked ? ' · 🔒 編輯中' : ''}</span>`;
}
function cloudPath(cx, cy, r) {
  let p = '', n = 10;
  for (let i = 0; i < n; i++) {
    const a1 = (i / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    p += (i === 0 ? `M ${x1} ${y1} ` : '') + `A ${r * 0.36} ${r * 0.36} 0 0 1 ${x2} ${y2} `;
  }
  return p;
}
function sheetBody(code) {
  if (code === 'A-201') return `
      <rect x="80" y="90" width="640" height="380" fill="none" stroke="#1f2328" stroke-width="3"/>
      ${[0,1,2,3,4,5,6,7].map(i => `
        <line x1="${120+i*80}" y1="70" x2="${120+i*80}" y2="480" stroke="#c8ccd2" stroke-width="1" stroke-dasharray="8 5"/>
        <circle cx="${120+i*80}" cy="58" r="13" fill="none" stroke="#59636e"/>
        <text x="${120+i*80}" y="62" text-anchor="middle" font-size="11" fill="#59636e">C${i+1}</text>
        ${[0,1,2,3].map(j => `<rect x="${115+i*80}" y="${115+j*100}" width="12" height="12" fill="#1f2328"/>`).join('')}
      `).join('')}
      <line x1="80" y1="280" x2="500" y2="280" stroke="#1f2328" stroke-width="2"/>
      <rect x="500" y="230" width="130" height="110" fill="none" stroke="#1f2328" stroke-width="2"/>
      <text x="565" y="290" text-anchor="middle" font-size="12" fill="#59636e">廁所</text>
      <circle cx="560" cy="182" r="6" fill="none" stroke="#1f2328" stroke-width="1.6"/>
      <text x="576" y="170" font-size="10" fill="#59636e">落水頭</text>`;
  if (code === 'A-501') return `
      <rect x="120" y="100" width="420" height="330" fill="none" stroke="#1f2328" stroke-width="3"/>
      ${[0,1,2].map(i => `<line x1="${225+i*105}" y1="100" x2="${225+i*105}" y2="360" stroke="#1f2328" stroke-width="2"/>`).join('')}
      <line x1="120" y1="360" x2="540" y2="360" stroke="#1f2328" stroke-width="2"/>
      ${[0,1,2,3].map(i => `<ellipse cx="${172+i*105}" cy="300" rx="22" ry="30" fill="none" stroke="#59636e" stroke-width="1.4"/>`).join('')}
      <text x="330" y="410" text-anchor="middle" font-size="13" fill="#59636e">廁所隔間大樣 S=1/30</text>`;
  if (code === 'E-301') return `
      <rect x="80" y="90" width="640" height="380" fill="none" stroke="#1f2328" stroke-width="3"/>
      ${[0,1,2].map(i => `<rect x="${140+i*180}" y="140" width="110" height="70" fill="none" stroke="#1f2328" stroke-width="2"/><text x="${195+i*180}" y="180" text-anchor="middle" font-size="11" fill="#59636e">配電盤 P${i+1}</text>`).join('')}
      <rect x="470" y="270" width="140" height="80" fill="none" stroke="#1f2328" stroke-width="2"/>
      <text x="540" y="312" text-anchor="middle" font-size="11" fill="#59636e">洗床機 ×3</text>`;
  return `
      <rect x="80" y="90" width="640" height="380" fill="none" stroke="#c8ccd2" stroke-width="2" stroke-dasharray="8 6"/>
      <text x="400" y="280" text-anchor="middle" font-size="15" fill="#8b949e">（尚無 ${code} 的示意圖，實圖預覽為後續目標）</text>`;
}
function renderSheet() {
  const code = curDwg;
  const d = S.history[code] || { name: '', building: '', history: [] };
  const marks = S.requests.filter(r => r.drawing === code).map(r => `
    <g class="marker ${curReq && curReq !== r.id ? 'dim' : ''}" data-req="${r.id}" onclick="selectReq('${r.id}')">
      <path class="cloud" d="${cloudPath(r.pos.x, r.pos.y, 44)}" stroke="${statusStroke[r.status]}"/>
      <circle cx="${r.pos.x+38}" cy="${r.pos.y-38}" r="13" fill="${statusStroke[r.status]}"/>
      <text x="${r.pos.x+38}" y="${r.pos.y-33.5}" text-anchor="middle" fill="#fff">${r.marker}</text>
    </g>`).join('');
  document.getElementById('sheet').innerHTML = `<svg viewBox="0 0 800 560" xmlns="http://www.w3.org/2000/svg">
    <rect x="14" y="14" width="772" height="532" fill="none" stroke="#1f2328" stroke-width="1.5"/>
    ${sheetBody(code)}
    <rect x="540" y="496" width="246" height="50" fill="none" stroke="#1f2328"/>
    <line x1="640" y1="496" x2="640" y2="546" stroke="#1f2328"/>
    <text x="555" y="516" font-size="11" fill="#59636e">圖號 ${code || '—'}</text>
    <text x="555" y="536" font-size="11" fill="#59636e">${d.name || ''}</text>
    <text x="655" y="516" font-size="11" fill="#59636e">版次 ${(d.history[0] || {}).ver || '—'}</text>
    <text x="655" y="536" font-size="11" fill="#59636e">${d.building || ''}</text>
    ${marks}
  </svg>`;
}
function renderHist() {
  const d = S.history[curDwg] || { history: [] };
  document.getElementById('hist-list').innerHTML = d.history.map(h => `
    <div class="hist-item">
      <span class="hist-ver">${h.ver}</span>
      <span>${h.note} <span style="font-family:var(--mono);font-size:11px;color:var(--accent)">${h.req}</span></span>
      <span class="hist-who">${h.date} · 設計 ${h.designer} · 核可 ${h.approver}</span>
    </div>`).join('') || '<div class="list-empty">尚無版本記錄</div>';
}

/* ═══ 收件匣（讀本地資料夾） ═══ */
function guessParse(m) {
  const codeM = m.body.match(/([A-Z]{1,2}-\d{3})/);
  const dueM = m.body.match(/(\d{1,2}\/\d{1,2})/);
  const firstLine = m.body.split('\n').map(s => s.trim()).filter(Boolean).pop() || m.body;
  return {
    drawing: codeM ? codeM[1] : (Object.keys(S.history)[0] || ''),
    title: firstLine.slice(0, 60),
    due: dueM ? dueM[1] : '',
  };
}
function isLinked(m) { return S.requests.find(r => r.source && r.source.from === m.file); }
function renderInbox() {
  const el = document.getElementById('msg-list');
  document.getElementById('inbox-path').textContent = S.config.inboxDir || '';
  const raw = S.inbox.filter(m => !isLinked(m)).length;
  const badge = document.getElementById('inbox-badge');
  badge.textContent = raw; badge.style.display = raw ? 'grid' : 'none';
  if (!S.inbox.length) { el.innerHTML = '<div class="list-empty">收件匣資料夾內沒有 .txt / .md 檔案</div>'; return; }
  el.innerHTML = S.inbox.map(m => {
    const linked = isLinked(m);
    let foot;
    if (linked) {
      foot = `<span class="done-chip">✓ 已轉為 <a onclick="switchView('work');selectReq('${linked.id}')">${linked.id}</a></span>`;
    } else {
      const g = guessParse(m);
      const opts = Object.keys(S.history).map(c => `<option value="${c}" ${c === g.drawing ? 'selected' : ''}>${c} ${S.history[c].name || ''}</option>`).join('');
      foot = `<button class="extract-btn" onclick="extractMsg('${m.file}')">✨ AI 萃取 → 產生 Request</button>
        <div class="thinking" id="think-${cssId(m.file)}"><div class="spinner"></div>辨識專案・圖號・位置對應中…</div>
        <div class="extract-result ${extractOpen === m.file ? 'show' : ''}" id="res-${cssId(m.file)}">
          <div class="ai-tag">✨ 萃取結果（目前為規則式解析，欄位可修改；AI 模型串接為下一步）</div>
          <div class="form-grid">
            <label>要求內容</label><input id="f-title-${cssId(m.file)}" value="${esc(g.title)}">
            <label>對應圖面</label><select id="f-dwg-${cssId(m.file)}">${opts}</select>
            <label>Designer</label><input id="f-designer-${cssId(m.file)}" value="${me()}">
            <label>回覆期限</label><input id="f-due-${cssId(m.file)}" value="${g.due}">
          </div>
          <button class="btn btn-primary" style="margin-top:10px" onclick="createReq('${m.file}')">＋ 確認建立 Request（🔴）</button>
        </div>`;
    }
    return `<div class="msg-card">
      <div class="msg-head">
        <div class="src-icon">📄</div>
        <div><div class="msg-from">${m.file}</div></div>
        <div class="msg-time">${m.mtime}</div>
      </div>
      <div class="msg-body">${esc(m.body)}</div>
      ${foot}
    </div>`;
  }).join('');
}
function cssId(s) { return s.replace(/[^a-zA-Z0-9_-]/g, '_'); }
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
function extractMsg(file) {
  const id = cssId(file);
  document.getElementById('think-' + id).classList.add('show');
  setTimeout(() => {
    document.getElementById('think-' + id).classList.remove('show');
    document.getElementById('res-' + id).classList.add('show');
    extractOpen = file;
  }, 900);
}
async function createReq(file) {
  const id = cssId(file);
  const m = S.inbox.find(x => x.file === file);
  const r = await api('/api/requests', {
    title: document.getElementById('f-title-' + id).value.trim(),
    drawing: document.getElementById('f-dwg-' + id).value,
    designer: document.getElementById('f-designer-' + id).value.trim() || me(),
    due: document.getElementById('f-due-' + id).value.trim(),
    requester: me(),
    source: { type: 'file', icon: '📄', from: m.file, quote: m.body.slice(0, 120) },
    sourceLabel: '收件匣檔案 ' + m.file,
    pos: { x: 150 + Math.floor(Math.random() * 120), y: 380 + Math.floor(Math.random() * 60) },
  });
  extractOpen = null;
  if (r.ok) toast(`🔴 已建立 ${r.request.id} 並連結至 ${r.request.drawing}`);
  await loadState();
}

/* ═══ 檔案庫（讀本地資料夾） ═══ */
function renderFiles() {
  document.getElementById('cad-path').textContent = S.config.cadDir || '';
  document.getElementById('pdf-path').textContent = S.config.pdfDir || '';
  const lockedCodes = new Set(S.requests.filter(r => r.localCopy && r.status !== 'green').map(r => r.drawing));
  document.getElementById('cad-files').innerHTML = S.files.cad.map(f => `
    <div class="file-row" onclick="openFile('cad','${esc(f.name)}')">
      📄 <span class="file-name">${f.name}</span>
      ${lockedCodes.has(f.code) ? '<span class="lock">🔒 編輯中（local copy）</span>' : ''}
      <span class="meta">${f.mtime}</span>
    </div>`).join('') || '<div class="list-empty">資料夾內沒有 CAD 檔案</div>';
  document.getElementById('pdf-files').innerHTML = S.files.pdf.map(f => {
    const pending = f.name.toLowerCase().includes('pending');
    return `<div class="file-row" onclick="openFile('pdf','${esc(f.name)}')">
      🧾 <span class="file-name">${f.name}</span>
      ${pending ? '<span class="pill-pending">⏳ pending 待確認</span>' : ''}
      <span class="meta">${f.mtime}</span>
    </div>`;
  }).join('') || '<div class="list-empty">資料夾內沒有 PDF 檔案</div>';
}

/* ═══ 工具 ═══ */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = 0; setTimeout(() => t.remove(), 400); }, 3800);
}
function renderAll(first) {
  renderList(); renderDetail(); renderDwgTabs(); renderSheet(); renderHist(); renderInbox(); renderFiles();
  if (first) setTab('todo');
}

loadState(true);
setInterval(() => {
  const modalOpen = document.querySelector('.modal-bg.show');
  if (!modalOpen && !extractOpen) loadState();
}, 8000);

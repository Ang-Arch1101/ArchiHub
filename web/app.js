/* ArchiHub 前端 — 對接本地後端 API（server.py） */
'use strict';

let S = { config: {}, requests: [], history: {}, files: { cad: [], pdf: [] }, inbox: [] };
let curTab = 'todo', curReq = null, curDwg = null;
let extractOpen = null; // 收件匣展開中的萃取表單（避免輪詢時蓋掉）
let placing = null;     // 重新定位模式：等待在圖上點擊的 request id
let dragging = null;    // 拖曳中的標記狀態
let pdfView = { code: null, pdfName: null, w: 800, h: 560, ok: false }; // 目前渲染的 PDF

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
      ${r.status !== 'green' ? `<button class="btn btn-ghost" onclick="setPlacing('${r.id}')">📍 重新定位標註（改在圖上點新位置）</button>` : ''}
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

/* ═══ 圖面 viewer（pdf.js 渲染真實 PDF ＋ 標註覆蓋層） ═══ */
function setDwg(code) {
  curDwg = code;
  renderSheet(); renderHist(); renderDwgTabs(); switchView('work');
}
/* 位置一律以正規化座標 (nx,ny ∈ 0~1) 儲存；相容舊格式 {x,y}（基於 800×560 畫布） */
function getPos(r) {
  if (!r.pos) return null;
  if (r.pos.nx != null) return { nx: r.pos.nx, ny: r.pos.ny };
  return { nx: r.pos.x / 800, ny: r.pos.y / 560 };
}
function latestPdfFor(code) {
  const cands = S.files.pdf.filter(f => f.code === code && !f.name.toLowerCase().includes('pending'));
  return cands.length ? cands[cands.length - 1] : null; // 檔名排序，流水號最大在後
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
async function renderSheet() {
  const code = curDwg;
  const stack = document.getElementById('canvas-stack');
  if (!stack) return;
  const pdfFile = latestPdfFor(code);

  // 需要重新渲染 PDF 底圖的情況（換圖或進了新版）
  if (pdfFile && (pdfView.code !== code || pdfView.pdfName !== pdfFile.name)) {
    const my = pdfView = { code, pdfName: pdfFile.name, w: 800, h: 560, ok: false, loading: true };
    try {
      const lib = await window.pdfjsReady;
      if (!lib) throw new Error('pdf.js 未載入');
      const pdf = await lib.getDocument({ url: location.origin + '/api/pdffile?name=' + encodeURIComponent(pdfFile.name) }).promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 2 }); // 2x 渲染保持清晰
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      // intent:'print' 避免依賴 requestAnimationFrame（背景分頁/隱藏視窗也能渲染完成）
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, intent: 'print' }).promise;
      if (pdfView !== my) return; // 渲染期間使用者已切圖
      pdfView.w = vp.width; pdfView.h = vp.height; pdfView.ok = true;
      stack.innerHTML = '';
      canvas.className = 'pdf-canvas';
      stack.appendChild(canvas);
      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      overlay.setAttribute('viewBox', `0 0 ${vp.width} ${vp.height}`);
      overlay.setAttribute('class', 'overlay');
      overlay.id = 'overlay';
      stack.appendChild(overlay);
      bindOverlayEvents(overlay);
    } catch (e) {
      console.error('PDF 渲染失敗', e);
      pdfView.ok = false;
    } finally {
      if (pdfView === my) pdfView.loading = false;
    }
  }

  if (pdfView.loading) return; // 另一個渲染進行中，完成後會畫標記
  if (!pdfFile || !pdfView.ok) { renderFallback(stack, code); return; }
  renderMarkers();
}
function renderFallback(stack, code) {
  const d = S.history[code] || { name: '', building: '', history: [] };
  pdfView = { code, pdfName: null, w: 800, h: 560, ok: false };
  stack.innerHTML = `<svg viewBox="0 0 800 560" xmlns="http://www.w3.org/2000/svg" class="fallback">
    <rect x="14" y="14" width="772" height="532" fill="none" stroke="#1f2328" stroke-width="1.5"/>
    <rect x="80" y="90" width="640" height="380" fill="none" stroke="#c8ccd2" stroke-width="2" stroke-dasharray="8 6"/>
    <text x="400" y="270" text-anchor="middle" font-size="15" fill="#8b949e">找不到 ${code || '—'} 的出圖 PDF</text>
    <text x="400" y="296" text-anchor="middle" font-size="12" fill="#8b949e">請確認出圖資料夾中有以 ${code || '圖號'} 開頭的 PDF 檔</text>
  </svg>
  <svg viewBox="0 0 800 560" class="overlay" id="overlay"></svg>`;
  bindOverlayEvents(document.getElementById('overlay'));
  renderMarkers();
}
function markerRadius() { return Math.max(pdfView.w, pdfView.h) * 0.045; }
function renderMarkers() {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  const W = pdfView.w, H = pdfView.h, R = markerRadius();
  overlay.innerHTML = S.requests.filter(r => r.drawing === pdfView.code && getPos(r)).map(r => {
    const p = getPos(r);
    const cx = p.nx * W, cy = p.ny * H;
    return `
    <g class="marker ${curReq && curReq !== r.id ? 'dim' : ''} ${dragging && dragging.id === r.id ? 'dragging' : ''}"
       data-req="${r.id}" transform="translate(${cx},${cy})">
      <path class="cloud" d="${cloudPath(0, 0, R)}" stroke="${statusStroke[r.status]}" stroke-width="${R * 0.07}"/>
      <circle cx="${R * 0.86}" cy="${-R * 0.86}" r="${R * 0.3}" fill="${statusStroke[r.status]}"/>
      <text x="${R * 0.86}" y="${-R * 0.86 + R * 0.11}" text-anchor="middle" fill="#fff" font-size="${R * 0.32}">${r.marker}</text>
    </g>`;
  }).join('');
}

/* ── 標註互動：拖曳修正 / 點擊定位（人工修正 → corrections.jsonl 訓練資料） ── */
function overlayCoords(overlay, ev) {
  const rect = overlay.getBoundingClientRect();
  return {
    nx: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
    ny: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
  };
}
function bindOverlayEvents(overlay) {
  overlay.addEventListener('pointerdown', ev => {
    const g = ev.target.closest('.marker');
    if (placing) {
      // 重新定位模式：點哪標哪
      const p = overlayCoords(overlay, ev);
      savePos(placing, p, 'marker_place');
      setPlacing(null);
      return;
    }
    if (!g) return;
    const id = g.dataset.req;
    const start = overlayCoords(overlay, ev);
    dragging = { id, start, moved: false, last: start };
    overlay.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  overlay.addEventListener('pointermove', ev => {
    if (!dragging) return;
    const p = overlayCoords(overlay, ev);
    if (Math.abs(p.nx - dragging.start.nx) * pdfView.w > 4 || Math.abs(p.ny - dragging.start.ny) * pdfView.h > 4) dragging.moved = true;
    dragging.last = p;
    if (dragging.moved) {
      const g = overlay.querySelector(`.marker[data-req="${dragging.id}"]`);
      if (g) g.setAttribute('transform', `translate(${p.nx * pdfView.w},${p.ny * pdfView.h})`);
    }
  });
  overlay.addEventListener('pointerup', () => {
    if (!dragging) return;
    const d = dragging; dragging = null;
    if (d.moved) savePos(d.id, d.last, 'marker_move');
    else selectReq(d.id); // 沒拖動＝點選
  });
}
async function savePos(id, pos, kind) {
  const r = await api(`/api/requests/${id}/pos`, { pos, kind, actor: me() });
  if (r.ok) {
    toast(kind === 'marker_place' ? `📍 已定位 ${id} 標註` : `🖐 已修正 ${id} 標註位置（已記錄為訓練資料）`);
    await loadState();
  } else toast('⚠ ' + r.error);
}
function setPlacing(id) {
  placing = id;
  const wrap = document.querySelector('.viewer-wrap');
  const hint = document.getElementById('hint-bar');
  if (id) {
    wrap.classList.add('placing');
    hint.textContent = `📍 定位模式：請在圖面上點擊 ${id} 的正確位置（Esc 取消）`;
    hint.classList.add('placing');
  } else {
    wrap.classList.remove('placing');
    hint.textContent = '🖐 拖曳雲朵標記可修正位置——每次修正都會記錄為訓練資料';
    hint.classList.remove('placing');
  }
}
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && placing) setPlacing(null); });
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
    pos: { nx: 0.12, ny: 0.85 },
  });
  extractOpen = null;
  if (r.ok) {
    toast(`🔴 已建立 ${r.request.id} 並連結至 ${r.request.drawing}`);
    await loadState();
    // 建單後直接進入定位模式：在圖上點一下位置＝完成標註（同時累積訓練資料）
    switchView('work');
    selectReq(r.request.id);
    setPlacing(r.request.id);
  } else {
    await loadState();
  }
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
  if (!modalOpen && !extractOpen && !dragging && !placing) loadState();
}, 8000);

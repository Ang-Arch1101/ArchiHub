const label = document.getElementById('tip-label');
const text = document.getElementById('tip-text');

document.querySelectorAll('.hero-network .node').forEach((node) => {
  const showNote = () => {
    label.textContent = node.dataset.label;
    text.textContent = node.dataset.text;
  };
  node.addEventListener('mouseenter', showNote);
  node.addEventListener('click', showNote);
});

const semanticMap = document.querySelector('.semantic-map');
const semanticCaption = semanticMap?.querySelector('.semantic-caption');
const semanticCaptionLabel = semanticCaption?.querySelector('span');
const semanticCaptionCopy = semanticCaption?.querySelector('p');
const semanticMotionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const semanticDefaults = {
  request: ['01 / REQUEST', '人執行工作，ArchiHub 記錄關係，專案因此變得可觀察。'],
  drawing: ['02 / DRAWING', 'A-201 的每一次修訂，都能回到促成它的 Request 與審核角色。'],
  project: ['03 / PROJECT', 'Project 928816 將圖面、需求、版本與人連成一張可持續閱讀的關係圖。'],
};

const updateSemanticCaption = (labelText, copyText) => {
  if (!semanticCaption || !semanticCaptionLabel || !semanticCaptionCopy) return;
  semanticCaptionLabel.textContent = labelText;
  semanticCaptionCopy.textContent = copyText;
  semanticCaption.classList.remove('is-updating');
  void semanticCaption.offsetWidth;
  semanticCaption.classList.add('is-updating');
};

const showSemanticLevel = (targetLevel, trigger) => {
  if (!semanticMap || semanticMap.dataset.switching === 'true') return;
  const currentLevel = semanticMap.dataset.currentLevel;
  const currentPanel = semanticMap.querySelector(`.semantic-level[data-level="${currentLevel}"]`);
  const nextPanel = semanticMap.querySelector(`.semantic-level[data-level="${targetLevel}"]`);
  if (!nextPanel || currentLevel === targetLevel) return;

  semanticMap.dataset.switching = 'true';
  trigger?.classList.add('is-portal-active');
  currentPanel?.classList.add('is-exiting');
  const exitDelay = semanticMotionReduced ? 0 : 210;

  window.setTimeout(() => {
    currentPanel?.classList.remove('is-active', 'is-exiting');
    currentPanel?.setAttribute('aria-hidden', 'true');
    currentPanel?.setAttribute('inert', '');
    nextPanel.classList.add('is-active', 'is-entering');
    nextPanel.setAttribute('aria-hidden', 'false');
    nextPanel.removeAttribute('inert');
    nextPanel.querySelector('.semantic-canvas-scroll')?.scrollTo({ left: 0, behavior: 'auto' });
    semanticMap.dataset.currentLevel = targetLevel;

    semanticMap.querySelectorAll('.semantic-crumb').forEach((crumb) => {
      const active = crumb.dataset.levelTarget === targetLevel;
      crumb.classList.toggle('is-active', active);
      if (active) crumb.setAttribute('aria-current', 'step');
      else crumb.removeAttribute('aria-current');
    });

    const [labelText, copyText] = semanticDefaults[targetLevel];
    updateSemanticCaption(labelText, copyText);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => nextPanel.classList.remove('is-entering')));
    window.setTimeout(() => {
      semanticMap.dataset.switching = 'false';
      trigger?.classList.remove('is-portal-active');
    }, semanticMotionReduced ? 10 : 390);
  }, exitDelay);
};

semanticMap?.querySelectorAll('[data-level-target]').forEach((control) => {
  control.addEventListener('click', () => showSemanticLevel(control.dataset.levelTarget, control));
});

semanticMap?.querySelectorAll('.semantic-node').forEach((node) => {
  const explain = () => {
    const level = node.closest('.semantic-level')?.dataset.level || 'request';
    const [labelText] = semanticDefaults[level];
    updateSemanticCaption(labelText, node.dataset.detail);
  };
  const restore = () => {
    const level = semanticMap.dataset.currentLevel;
    if (!node.classList.contains('is-highlighted')) updateSemanticCaption(...semanticDefaults[level]);
  };
  node.addEventListener('mouseenter', explain);
  node.addEventListener('focus', explain);
  node.addEventListener('mouseleave', restore);
  node.addEventListener('blur', restore);
  node.addEventListener('click', () => {
    node.closest('.semantic-level')?.querySelectorAll('.semantic-node').forEach((item) => item.classList.remove('is-highlighted'));
    node.classList.add('is-highlighted');
    explain();
  });
});

const workflowCards = document.querySelectorAll('.tool-explainer article');
const workflowObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => entry.target.classList.toggle('is-visible', entry.isIntersecting));
}, { threshold: 0.35 });

workflowCards.forEach((card) => workflowObserver.observe(card));

document.querySelector('.request-confirm')?.addEventListener('click', (event) => {
  const window = event.currentTarget.closest('.task-window');
  window.classList.toggle('linked');
  event.currentTarget.textContent = window.classList.contains('linked') ? 'Request 已確認' : '確認 Request';
});

const approveWindow = document.querySelector('.approve-window');
const reviewStatus = approveWindow?.querySelector('.review-status');

approveWindow?.querySelector('.approve-action').addEventListener('click', () => {
  approveWindow.classList.remove('returning');
  approveWindow.classList.add('approved');
  reviewStatus.textContent = '已完成';
  reviewStatus.className = 'review-status done';
});

approveWindow?.querySelector('.return-action').addEventListener('click', () => {
  approveWindow.classList.remove('approved');
  approveWindow.classList.add('returning');
  reviewStatus.textContent = '填寫退回原因';
  reviewStatus.className = 'review-status returned';
  approveWindow.querySelector('textarea').focus();
});

const resetReview = () => {
  approveWindow.classList.remove('approved', 'returning');
  reviewStatus.textContent = '待確認';
  reviewStatus.className = 'review-status';
};

approveWindow?.querySelector('.cancel-return').addEventListener('click', resetReview);
approveWindow?.querySelector('.send-return').addEventListener('click', () => {
  approveWindow.classList.remove('returning');
  approveWindow.classList.add('approved');
  approveWindow.querySelector('.complete-notice b').textContent = '修改要求已送出';
  approveWindow.querySelector('.complete-notice span').textContent = 'Designer 已收到問題與修改通知';
  reviewStatus.textContent = '已退回';
  reviewStatus.className = 'review-status returned';
});

const miniPlan = document.querySelector('.mini-plan');
const cloudMark = miniPlan?.querySelector('.cloud-mark');

if (cloudMark) {
  miniPlan.previousElementSibling.querySelector('span').textContent = '拖曳雲線定位';
  miniPlan.querySelector('em').textContent = '拖曳雲線到修改位置';
  cloudMark.setAttribute('role', 'button');
  cloudMark.setAttribute('tabindex', '0');
  cloudMark.setAttribute('aria-label', '拖曳修訂雲線，標記修改位置');
  cloudMark.innerHTML = '<svg viewBox="0 0 170 74" aria-hidden="true"><path d="M25 12C30 3 40 3 45 12C50 3 60 3 65 12C70 3 80 3 85 12C90 3 100 3 105 12C110 3 120 3 125 12C130 3 140 3 145 12C154 17 154 23 145 27C154 32 154 38 145 42C154 47 154 53 145 58C140 67 130 67 125 58C120 67 110 67 105 58C100 67 90 67 85 58C80 67 70 67 65 58C60 67 50 67 45 58C40 67 30 67 25 58C16 53 16 47 25 42C16 38 16 32 25 27C16 23 16 17 25 12Z"/></svg><span>調整天花高度</span>';

  cloudMark.addEventListener('pointerdown', (event) => {
    const planBounds = miniPlan.getBoundingClientRect();
    const markBounds = cloudMark.getBoundingClientRect();
    const offsetX = event.clientX - markBounds.left;
    const offsetY = event.clientY - markBounds.top;
    cloudMark.classList.add('is-dragging');
    cloudMark.setPointerCapture(event.pointerId);

    const moveMark = (moveEvent) => {
      const maxX = planBounds.width - markBounds.width;
      const maxY = planBounds.height - markBounds.height;
      const nextX = Math.min(Math.max(moveEvent.clientX - planBounds.left - offsetX, 0), maxX);
      const nextY = Math.min(Math.max(moveEvent.clientY - planBounds.top - offsetY, 0), maxY);
      cloudMark.style.left = `${nextX}px`;
      cloudMark.style.top = `${nextY}px`;
    };

    const placeMark = () => {
      cloudMark.classList.remove('is-dragging');
      cloudMark.removeEventListener('pointermove', moveMark);
      cloudMark.removeEventListener('pointerup', placeMark);
      cloudMark.removeEventListener('pointercancel', placeMark);
    };

    cloudMark.addEventListener('pointermove', moveMark);
    cloudMark.addEventListener('pointerup', placeMark);
  cloudMark.addEventListener('pointercancel', placeMark);
  });
}

const drawingLinkPanel = document.querySelector('.drawing-link-panel');
const demoPath = location.pathname.includes('/overview/') ? '../web/index.html?demo=1' : './web/index.html?demo=1';
if (drawingLinkPanel) {
  const simulatedLink = drawingLinkPanel.querySelector('a');
  simulatedLink.href = demoPath;
  simulatedLink.textContent = '開啟模擬工作台 ↗';
  drawingLinkPanel.insertAdjacentHTML('beforeend', '<div class="drawing-app-icons" aria-label="可模擬檢視 Revit 與 CAD 圖面"><span class="app-icon revit">R</span><span class="app-icon cad">CAD</span></div>');
}

const demoEntry = document.querySelector('.closing .button');
if (demoEntry) {
  demoEntry.href = demoPath;
  demoEntry.firstChild.textContent = '開啟 ArchiHub 工作台 ';
}

document.querySelectorAll('.mail-viewport, .history-viewport').forEach((viewport) => {
  viewport.addEventListener('wheel', (event) => {
    viewport.scrollTop += event.deltaY;
    event.preventDefault();
  }, { passive: false });
});

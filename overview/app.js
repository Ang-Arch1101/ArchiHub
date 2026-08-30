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

const requestCanvas = semanticMap?.querySelector('.request-canvas');
if (requestCanvas) {
  const reviewNode = requestCanvas.querySelector('.node-review');
  const reviewResult = reviewNode?.querySelector('.review-result');
  const reviewActions = requestCanvas.querySelector('.review-actions');
  const approveAction = requestCanvas.querySelector('.review-approve');
  const returnAction = requestCanvas.querySelector('.review-return');
  const roleNode = requestCanvas.querySelector('.request-role');
  const returnCard = requestCanvas.querySelector('.request-return-card');
  const resubmitAction = requestCanvas.querySelector('.return-resubmit');
  const publishNode = requestCanvas.querySelector('.node-publish');
  const publishLink = requestCanvas.querySelector('.publish-link');
  const publishPlaceholder = requestCanvas.querySelector('.publish-placeholder');
  const placeholderTitle = publishPlaceholder?.querySelector('b');
  const placeholderCopy = publishPlaceholder?.querySelector('small');
  const resetAction = requestCanvas.querySelector('.request-reset');
  const timelineNodes = [...requestCanvas.querySelectorAll('.request-timeline .request-node')];
  let requestGuideTimers = [];
  let requestGuideHasPlayed = false;

  const clearRequestGuide = ({ keepReady = false } = {}) => {
    requestGuideTimers.forEach((timer) => window.clearTimeout(timer));
    requestGuideTimers = [];
    requestCanvas.classList.remove('is-guiding');
    timelineNodes.forEach((node) => node.classList.remove('is-guide-current', 'is-guide-past', 'is-guide-final'));
    if (!keepReady) timelineNodes.forEach((node) => node.classList.remove('is-guide-ready'));
    timelineNodes.forEach((node) => node.parentElement?.classList.remove('is-guide-past'));
  };

  const runRequestGuide = ({ force = false } = {}) => {
    if (semanticMotionReduced || requestCanvas.dataset.flowState !== 'initial' || (requestGuideHasPlayed && !force)) return;
    clearRequestGuide();
    requestGuideHasPlayed = true;
    requestCanvas.classList.add('is-guiding');

    timelineNodes.forEach((node, index) => {
      requestGuideTimers.push(window.setTimeout(() => {
        timelineNodes.forEach((item) => item.classList.remove('is-guide-current'));
        timelineNodes.slice(0, index).forEach((item) => {
          item.classList.add('is-guide-past');
          item.parentElement?.classList.add('is-guide-past');
        });
        node.classList.add('is-guide-current');
      }, index * 400));
    });

    const finalNode = timelineNodes.at(-1);
    const finalStart = timelineNodes.length * 400;
    requestGuideTimers.push(window.setTimeout(() => {
      timelineNodes.forEach((node) => node.classList.remove('is-guide-current'));
      finalNode?.classList.add('is-guide-ready', 'is-guide-final');
    }, finalStart));
    requestGuideTimers.push(window.setTimeout(() => clearRequestGuide({ keepReady: true }), finalStart + 1950));
  };

  const stateCopy = {
    initial: '點擊「審核確認」，模擬通過或退回兩種處理結果。',
    reviewing: '由同一位指派／審圖負責人選擇通過或退回修改。',
    approved: '審核已通過；正式發布入口已開啟，可以進入 Drawing 查看圖面關係。',
    returned: '審核已退回；修改單記錄問題、圖面位置與期限，並回到執行修改。',
    reprocessing: '修改完成後，工作重新經過提交版本並回到審核確認。',
  };

  const setRequestState = (state) => {
    requestCanvas.dataset.flowState = state;
    reviewActions.hidden = state !== 'reviewing';
    returnCard.hidden = state !== 'returned';
    publishNode.hidden = state !== 'approved';
    publishLink.hidden = state !== 'approved';
    publishPlaceholder.hidden = state === 'reviewing' || state === 'approved' || state === 'reprocessing';
    reviewNode.setAttribute('aria-expanded', String(state === 'reviewing'));
    roleNode.classList.toggle('is-highlighted', state === 'returned');

    const resultLabels = {
      initial: '點擊選擇',
      reviewing: '請選擇',
      approved: '審核通過',
      returned: '已退回',
      reprocessing: '重新提交中',
    };
    reviewResult.textContent = resultLabels[state];

    if (state === 'approved') {
      publishNode.classList.remove('is-revealed');
      void publishNode.offsetWidth;
      publishNode.classList.add('is-revealed');
    } else {
      publishNode.classList.remove('is-revealed');
    }

    if (state === 'returned') {
      placeholderTitle.textContent = '已退回修改';
      placeholderCopy.textContent = '完成修改並重新提交後，再次進行審核';
    } else {
      placeholderTitle.textContent = '等待審核結果';
      placeholderCopy.textContent = '通過後顯示正式發布入口';
    }

    updateSemanticCaption('01 / REQUEST', stateCopy[state]);
  };

  requestCanvas.addEventListener('click', (event) => {
    if (event.target.closest('button')) clearRequestGuide();
  }, true);

  reviewNode?.addEventListener('click', () => setRequestState('reviewing'));
  approveAction?.addEventListener('click', () => setRequestState('approved'));
  returnAction?.addEventListener('click', () => setRequestState('returned'));
  resetAction?.addEventListener('click', () => {
    requestCanvas.querySelectorAll('.semantic-node').forEach((node) => node.classList.remove('is-highlighted'));
    requestCanvas.classList.remove('show-role-relation', 'show-return-relation');
    setRequestState('initial');
    window.requestAnimationFrame(() => runRequestGuide({ force: true }));
  });

  resubmitAction?.addEventListener('click', (event) => {
    event.stopPropagation();
    setRequestState('reprocessing');
    window.setTimeout(() => {
      setRequestState('reviewing');
      reviewNode?.focus();
    }, semanticMotionReduced ? 0 : 780);
  });

  const showRoleRelation = () => requestCanvas.classList.add('show-role-relation');
  const hideRoleRelation = () => requestCanvas.classList.remove('show-role-relation');
  roleNode?.addEventListener('mouseenter', showRoleRelation);
  roleNode?.addEventListener('focus', showRoleRelation);
  roleNode?.addEventListener('mouseleave', hideRoleRelation);
  roleNode?.addEventListener('blur', hideRoleRelation);

  const showReturnRelation = () => {
    requestCanvas.classList.add('show-return-relation');
    updateSemanticCaption('01 / REQUEST', returnCard.dataset.detail);
  };
  const hideReturnRelation = () => requestCanvas.classList.remove('show-return-relation');
  returnCard?.addEventListener('mouseenter', showReturnRelation);
  returnCard?.addEventListener('focus', showReturnRelation);
  returnCard?.addEventListener('mouseleave', hideReturnRelation);
  returnCard?.addEventListener('blur', hideReturnRelation);

  const requestGuideObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    runRequestGuide();
    requestGuideObserver.disconnect();
  }, { threshold: 0.4 });
  requestGuideObserver.observe(requestCanvas.closest('.semantic-level'));
}

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

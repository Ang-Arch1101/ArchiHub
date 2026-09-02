const heroNetwork = document.querySelector('.hero-network');
const heroNodes = [...document.querySelectorAll('.hero-network .node')];
const heroCenterNode = heroNetwork?.querySelector('.node.center');
let lockedHeroNode = null;

const renderHeroNode = (activeNode = lockedHeroNode) => {
  heroNodes.forEach((node) => {
    const isActive = node === activeNode;
    const isLocked = node === lockedHeroNode;
    node.classList.toggle('is-expanded', isActive);
    node.setAttribute('aria-expanded', String(isActive));
    node.setAttribute('aria-pressed', String(isLocked));
  });
  heroCenterNode?.classList.toggle('is-default-active', !activeNode);
};

const toggleHeroNodeLock = (node) => {
  lockedHeroNode = lockedHeroNode === node ? null : node;
  renderHeroNode();
};

heroNodes.forEach((node) => {
  node.addEventListener('mouseenter', () => renderHeroNode(node));
  node.addEventListener('mouseleave', () => renderHeroNode());
  node.addEventListener('focus', () => renderHeroNode(node));
  node.addEventListener('blur', () => renderHeroNode());
  node.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleHeroNodeLock(node);
  });
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleHeroNodeLock(node);
    }
    if (event.key === 'Escape') {
      lockedHeroNode = null;
      renderHeroNode();
      node.blur?.();
    }
  });
});

heroNetwork?.querySelector('svg')?.addEventListener('click', (event) => {
  if (event.target.closest('.node')) return;
  lockedHeroNode = null;
  renderHeroNode();
});

renderHeroNode();

const heroMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const heroConnectionLines = [...document.querySelectorAll('.hero-network .connection-flow')];
const heroOuterLines = heroConnectionLines.slice(0, 5);
const heroCenterLines = heroConnectionLines.slice(5);
const heroOuterTargets = [
  heroNetwork?.querySelector('.n-person'),
  heroNetwork?.querySelector('.n-version'),
  heroNetwork?.querySelector('.n-review'),
  heroNetwork?.querySelector('.n-drawing'),
  heroNetwork?.querySelector('.n-email'),
];
let heroConnectionTimers = [];

const clearHeroConnectionLoop = () => {
  heroConnectionTimers.forEach((timer) => window.clearTimeout(timer));
  heroConnectionTimers = [];
  heroConnectionLines.forEach((line) => line.classList.remove('is-tracing'));
  heroNodes.forEach((node) => node.classList.remove('is-line-pulsing'));
};

const scheduleHeroConnection = (line, target, delay) => {
  heroConnectionTimers.push(window.setTimeout(() => line.classList.add('is-tracing'), delay));
  heroConnectionTimers.push(window.setTimeout(() => {
    if (!target) return;
    target.classList.remove('is-line-pulsing');
    void target.getBoundingClientRect();
    target.classList.add('is-line-pulsing');
  }, delay + 980));
  heroConnectionTimers.push(window.setTimeout(() => {
    target?.classList.remove('is-line-pulsing');
  }, delay + 1800));
};

const runHeroConnectionLoop = () => {
  clearHeroConnectionLoop();
  if (heroMotionQuery.matches || !heroConnectionLines.length) return;
  void heroNetwork?.offsetWidth;

  heroOuterLines.forEach((line, index) => {
    scheduleHeroConnection(line, heroOuterTargets[index], index * 1200);
  });
  heroCenterLines.forEach((line, index) => {
    scheduleHeroConnection(line, heroCenterNode, 6500 + index * 900);
  });
  heroConnectionTimers.push(window.setTimeout(runHeroConnectionLoop, 12500));
};

heroMotionQuery.addEventListener?.('change', runHeroConnectionLoop);
runHeroConnectionLoop();

const skillTree = document.querySelector('.skill-tree');
const skillTreeConnectionLines = [...document.querySelectorAll('.skill-tree .tree-flow')];
let skillTreeConnectionTimers = [];
let skillTreeIsVisible = false;

const clearSkillTreeConnectionLoop = () => {
  skillTreeConnectionTimers.forEach((timer) => window.clearTimeout(timer));
  skillTreeConnectionTimers = [];
  skillTreeConnectionLines.forEach((line) => line.classList.remove('is-tracing'));
};

const runSkillTreeConnectionLoop = () => {
  clearSkillTreeConnectionLoop();
  if (heroMotionQuery.matches || !skillTreeIsVisible || !skillTreeConnectionLines.length) return;
  void skillTree?.offsetWidth;

  skillTreeConnectionLines.forEach((line, index) => {
    skillTreeConnectionTimers.push(window.setTimeout(() => line.classList.add('is-tracing'), index * 1200));
  });
  skillTreeConnectionTimers.push(window.setTimeout(runSkillTreeConnectionLoop, 6500));
};

if (skillTree) {
  const skillTreeObserver = new IntersectionObserver(([entry]) => {
    skillTreeIsVisible = entry.isIntersecting;
    if (skillTreeIsVisible) runSkillTreeConnectionLoop();
    else clearSkillTreeConnectionLoop();
  }, { threshold: 0.35 });
  skillTreeObserver.observe(skillTree);
  heroMotionQuery.addEventListener?.('change', runSkillTreeConnectionLoop);
}

const semanticMap = document.querySelector('.semantic-map');
const semanticCaption = semanticMap?.querySelector('.semantic-caption');
const semanticCaptionLabel = semanticCaption?.querySelector('span');
const semanticCaptionCopy = semanticCaption?.querySelector('p');
const semanticMotionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const semanticDefaults = {
  request: ['01 / REQUEST', '人執行工作，ArchiHub 記錄關係，專案因此變得可觀察。'],
  drawing: ['02 / DRAWING', 'A201 的每一次進版，都記錄 Request、Architecture Engineer 與 Architecture Lead，並匯入目前正式版次 -R24。'],
  project: ['03 / PROJECT', 'PROJECT 001 連接不同來源、圖面與固定 Discipline Lead；A201-R24 是目前閱讀中的主線。'],
};
let runDrawingGuide = () => {};
let runProjectGuide = () => {};

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
      if (targetLevel === 'drawing') runDrawingGuide({ force: true });
      if (targetLevel === 'project') runProjectGuide({ force: true });
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
  const intakeCard = requestCanvas.querySelector('.request-intake');
  const acceptAction = requestCanvas.querySelector('.request-accept');
  const openAction = requestCanvas.querySelector('.request-open');
  const intakeStatus = requestCanvas.querySelector('.request-intake-status');
  const locateNode = requestCanvas.querySelector('.node-locate');
  const timelineNodes = [...requestCanvas.querySelectorAll('.request-timeline .request-node')];
  let requestGuideTimers = [];
  let requestPreludeHasPlayed = false;
  let requestGuideHasPlayed = false;

  const clearRequestGuide = ({ keepReady = false } = {}) => {
    requestGuideTimers.forEach((timer) => window.clearTimeout(timer));
    requestGuideTimers = [];
    requestCanvas.classList.remove('is-guiding');
    timelineNodes.forEach((node) => node.classList.remove('is-guide-current', 'is-guide-past', 'is-guide-final'));
    if (!keepReady) timelineNodes.forEach((node) => node.classList.remove('is-guide-ready'));
    timelineNodes.forEach((node) => node.parentElement?.classList.remove('is-guide-past'));
  };

  const setTimelinePast = (count) => {
    timelineNodes.slice(0, count).forEach((node) => {
      node.classList.add('is-guide-past');
      node.parentElement?.classList.add('is-guide-past');
    });
  };

  const revealRequestIntake = () => {
    requestCanvas.dataset.entryState = 'pending';
    if (intakeCard) intakeCard.hidden = false;
    updateSemanticCaption('01 / REQUEST', 'Site Engineer 的原始需求已接收；接受任務後，系統才會整理資訊並定位圖面。');
  };

  const runRequestPrelude = ({ force = false } = {}) => {
    if (requestCanvas.dataset.flowState !== 'initial' || requestCanvas.dataset.entryState !== 'receiving' || (requestPreludeHasPlayed && !force)) return;
    clearRequestGuide();
    requestPreludeHasPlayed = true;
    requestCanvas.classList.add('is-guiding');
    timelineNodes[0]?.classList.add('is-guide-current');

    const finishPrelude = () => {
      timelineNodes[0]?.classList.remove('is-guide-current');
      setTimelinePast(1);
      requestCanvas.classList.remove('is-guiding');
      revealRequestIntake();
    };

    if (semanticMotionReduced) finishPrelude();
    else requestGuideTimers.push(window.setTimeout(finishPrelude, 400));
  };

  const runLocateGuide = () => {
    clearRequestGuide();
    requestCanvas.dataset.entryState = 'processing';
    setTimelinePast(1);

    const finishLocate = () => {
      timelineNodes.forEach((node) => node.classList.remove('is-guide-current'));
      setTimelinePast(3);
      requestCanvas.classList.remove('is-guiding');
      requestCanvas.classList.add('has-located-drawing');
      requestCanvas.dataset.entryState = 'located';
      locateNode?.setAttribute('aria-hidden', 'false');
      locateNode?.setAttribute('tabindex', '0');
      if (openAction) openAction.hidden = false;
      updateSemanticCaption('01 / REQUEST', 'REQ-043 已定位至 A201 二樓平面圖；前往任務後開始指派、修改、提交與審核。');
      openAction?.focus();
    };

    if (semanticMotionReduced) {
      finishLocate();
      return;
    }

    requestCanvas.classList.add('is-guiding');
    timelineNodes.slice(1, 3).forEach((node, segmentIndex) => {
      const nodeIndex = segmentIndex + 1;
      requestGuideTimers.push(window.setTimeout(() => {
        timelineNodes.forEach((item) => item.classList.remove('is-guide-current'));
        setTimelinePast(nodeIndex);
        node.classList.add('is-guide-current');
        if (nodeIndex === 2) requestCanvas.classList.add('has-located-drawing');
      }, segmentIndex * 400));
    });
    requestGuideTimers.push(window.setTimeout(finishLocate, 800));
  };

  const runRequestGuide = ({ force = false } = {}) => {
    if (requestCanvas.dataset.flowState !== 'initial' || requestCanvas.dataset.entryState !== 'active' || (requestGuideHasPlayed && !force)) return;
    clearRequestGuide();
    requestGuideHasPlayed = true;
    setTimelinePast(3);
    if (semanticMotionReduced) {
      requestCanvas.classList.add('has-located-drawing');
      setTimelinePast(timelineNodes.length - 1);
      timelineNodes.at(-1)?.classList.add('is-guide-ready');
      return;
    }
    requestCanvas.classList.add('is-guiding');

    const taskNodes = timelineNodes.slice(3);
    taskNodes.forEach((node, segmentIndex) => {
      const index = segmentIndex + 3;
      requestGuideTimers.push(window.setTimeout(() => {
        timelineNodes.forEach((item) => item.classList.remove('is-guide-current'));
        setTimelinePast(index);
        node.classList.add('is-guide-current');
      }, segmentIndex * 400));
    });

    const finalNode = timelineNodes.at(-1);
    const finalStart = taskNodes.length * 400;
    requestGuideTimers.push(window.setTimeout(() => {
      timelineNodes.forEach((node) => node.classList.remove('is-guide-current'));
      finalNode?.classList.add('is-guide-ready', 'is-guide-final');
    }, finalStart));
  };

  const stateCopy = {
    initial: '點擊「審核確認」，模擬通過或退回兩種處理結果。',
    reviewing: '由同一位 Architecture Lead 選擇通過或退回修改。',
    approved: 'Architecture Lead 已通過審核；正式發布入口已開啟，發布後將通知 Requester。',
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
    const clickedButton = event.target.closest('button');
    if (clickedButton === reviewNode || clickedButton === resetAction || clickedButton?.closest('.review-actions')) clearRequestGuide();
  }, true);

  reviewNode?.addEventListener('click', () => {
    if (requestCanvas.dataset.entryState === 'active') setRequestState('reviewing');
  });
  approveAction?.addEventListener('click', () => setRequestState('approved'));
  returnAction?.addEventListener('click', () => setRequestState('returned'));
  acceptAction?.addEventListener('click', () => {
    requestCanvas.dataset.entryState = 'processing';
    intakeCard?.classList.add('is-accepted');
    if (intakeStatus) intakeStatus.textContent = '任務已接受';
    acceptAction.hidden = true;
    updateSemanticCaption('01 / REQUEST', '任務已接受；接著整理 REQ-043 的資訊並定位它所影響的圖面。');
    window.setTimeout(() => {
      if (intakeCard) {
        intakeCard.classList.add('is-departing');
        window.setTimeout(() => {
          intakeCard.hidden = true;
          intakeCard.classList.remove('is-departing');
          runLocateGuide();
        }, semanticMotionReduced ? 0 : 320);
      } else {
        runLocateGuide();
      }
    }, semanticMotionReduced ? 0 : 260);
  });
  openAction?.addEventListener('click', () => {
    requestCanvas.dataset.entryState = 'active';
    openAction.hidden = true;
    runRequestGuide();
  });
  locateNode?.addEventListener('click', () => requestCanvas.classList.add('has-located-drawing'));
  resetAction?.addEventListener('click', () => {
    requestCanvas.querySelectorAll('.semantic-node').forEach((node) => node.classList.remove('is-highlighted'));
    requestCanvas.classList.remove('show-role-relation', 'show-return-relation', 'has-located-drawing');
    locateNode?.setAttribute('aria-hidden', 'true');
    locateNode?.setAttribute('tabindex', '-1');
    requestCanvas.dataset.entryState = 'receiving';
    requestPreludeHasPlayed = false;
    requestGuideHasPlayed = false;
    if (intakeCard) {
      intakeCard.hidden = true;
      intakeCard.classList.remove('is-accepted', 'is-departing');
    }
    if (intakeStatus) intakeStatus.textContent = '等待接受';
    if (acceptAction) acceptAction.hidden = false;
    if (openAction) openAction.hidden = true;
    setRequestState('initial');
    window.requestAnimationFrame(() => runRequestPrelude({ force: true }));
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

  const requestPreludeObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    runRequestPrelude();
    requestPreludeObserver.disconnect();
  }, { threshold: 0.4 });
  requestPreludeObserver.observe(requestCanvas.closest('.semantic-level'));

}

const drawingCanvas = semanticMap?.querySelector('.drawing-canvas');
if (drawingCanvas) {
  const historyRows = [...drawingCanvas.querySelectorAll('.history-scan-row')];
  const earlyRows = [...drawingCanvas.querySelectorAll('.history-early-row')];
  const recentRows = [...drawingCanvas.querySelectorAll('.history-recent-row')];
  const historyTrack = drawingCanvas.querySelector('.drawing-history-track');
  const ellipsisRow = drawingCanvas.querySelector('.history-ellipsis-row');
  const historyDots = [...drawingCanvas.querySelectorAll('.history-dot')];
  const currentRow = drawingCanvas.querySelector('.current-version-row');
  const currentCells = [...drawingCanvas.querySelectorAll('.history-cell')];
  const drawingLink = drawingCanvas.querySelector('.current-drawing-link');
  const drawingHub = drawingCanvas.querySelector('.drawing-hub');
  let drawingGuideTimers = [];

  const clearDrawingGuide = () => {
    drawingGuideTimers.forEach((timer) => window.clearTimeout(timer));
    drawingGuideTimers = [];
    historyRows.forEach((row) => row.classList.remove('is-history-visible'));
    historyTrack?.classList.remove('is-scrolled');
    ellipsisRow?.classList.remove('is-history-visible');
    historyDots.forEach((dot) => dot.classList.remove('is-dot-visible'));
    currentRow?.classList.remove('is-current-visible');
    currentCells.forEach((cell) => cell.classList.remove('is-current-lit'));
    drawingLink?.classList.remove('is-connected');
    drawingHub?.classList.remove('is-drawing-lit', 'has-revision');
    drawingCanvas.dataset.drawingState = 'idle';
  };

  runDrawingGuide = ({ force = false } = {}) => {
    if (drawingCanvas.dataset.drawingState === 'complete' && !force) return;
    clearDrawingGuide();

    if (semanticMotionReduced) {
      historyRows.forEach((row) => row.classList.add('is-history-visible'));
      ellipsisRow?.classList.add('is-history-visible');
      historyDots.forEach((dot) => dot.classList.add('is-dot-visible'));
      historyTrack?.classList.add('is-scrolled');
      currentRow?.classList.add('is-current-visible');
      currentCells.forEach((cell) => cell.classList.add('is-current-lit'));
      drawingLink?.classList.add('is-connected');
      drawingHub?.classList.add('is-drawing-lit', 'has-revision');
      drawingCanvas.dataset.drawingState = 'complete';
      return;
    }

    drawingCanvas.dataset.drawingState = 'playing';
    earlyRows.forEach((row, index) => {
      drawingGuideTimers.push(window.setTimeout(() => row.classList.add('is-history-visible'), 110 + index * 150));
    });
    drawingGuideTimers.push(window.setTimeout(() => ellipsisRow?.classList.add('is-history-visible'), 610));
    [0, 1, 2].forEach((dotIndex) => {
      drawingGuideTimers.push(window.setTimeout(() => {
        historyDots.filter((_, index) => index % 3 === dotIndex).forEach((dot) => dot.classList.add('is-dot-visible'));
      }, 680 + dotIndex * 220));
    });
    drawingGuideTimers.push(window.setTimeout(() => recentRows.forEach((row) => row.classList.add('is-history-visible')), 1350));
    drawingGuideTimers.push(window.setTimeout(() => historyTrack?.classList.add('is-scrolled'), 1470));
    drawingGuideTimers.push(window.setTimeout(() => currentRow?.classList.add('is-current-visible'), 2210));
    currentCells.forEach((cell, index) => {
      drawingGuideTimers.push(window.setTimeout(() => cell.classList.add('is-current-lit'), 2550 + index * 330));
    });
    drawingGuideTimers.push(window.setTimeout(() => drawingLink?.classList.add('is-connected'), 3610));
    drawingGuideTimers.push(window.setTimeout(() => drawingHub?.classList.add('is-drawing-lit'), 4150));
    drawingGuideTimers.push(window.setTimeout(() => {
      drawingHub?.classList.add('has-revision');
      drawingCanvas.dataset.drawingState = 'complete';
      updateSemanticCaption('02 / DRAWING', 'Current Version R24 已完成 Request、Architecture Engineer 與 Architecture Lead 三個欄位，並正式寫入 A201-R24。');
    }, 4570));
  };
}

const projectCanvas = semanticMap?.querySelector('.project-canvas');
if (projectCanvas) {
  const projectCore = projectCanvas.querySelector('.project-core');
  const coreSummary = projectCore?.querySelector('small');
  const projectBlocks = [...projectCanvas.querySelectorAll('.project-drawing-block')];
  const projectLinks = [...projectCanvas.querySelectorAll('[data-project-link]')];
  const mainBlock = projectCanvas.querySelector('[data-project-block="a201"]');
  const mainLink = projectCanvas.querySelector('[data-project-link="a201"]');
  const secondaryOrder = ['s203', 'm101', 'a101', 'e201', 'p101'];
  const rightGridSlots = [
    { left: 640, top: 20 },
    { left: 790, top: 85 },
    { left: 940, top: 226 },
    { left: 790, top: 367 },
    { left: 640, top: 432 },
  ];
  const rightDetailSlots = [
    { left: 640, top: 20 },
    { left: 900, top: 72 },
    { left: 900, top: 380 },
    { left: 640, top: 432 },
  ];
  let projectGuideTimers = [];
  let expandedProjectKey = 'a201';
  let projectIsCollapsed = false;

  const layoutProjectBlocks = (selectedKey = expandedProjectKey) => {
    expandedProjectKey = selectedKey;
    projectCanvas.dataset.expandedDrawing = selectedKey;
    let compactIndex = 0;
    const a201IsSelected = selectedKey === 'a201';

    projectBlocks.forEach((block) => {
      const key = block.dataset.projectBlock;
      const isSelected = key === selectedKey;
      let left;
      let top;

      if (key === 'a201') {
        left = isSelected ? 20 : 300;
        top = isSelected ? 145 : 226;
      } else if (isSelected) {
        left = 640;
        top = 145;
      } else {
        const slot = (a201IsSelected ? rightGridSlots : rightDetailSlots)[compactIndex++];
        left = slot.left;
        top = slot.top;
      }

      const link = projectCanvas.querySelector(`[data-project-link="${key}"]`);

      block.style.left = `${left}px`;
      block.style.top = `${top}px`;
      block.classList.toggle('is-expanded', isSelected);
      block.classList.toggle('is-highlighted', isSelected);
      block.setAttribute('aria-expanded', String(isSelected));
      link?.classList.toggle('project-link-main', isSelected);
      if (key === 'a201') {
        link?.setAttribute('d', 'M440 255 C446 255 451 255 456 255');
      } else {
        const blockCenterX = left + (isSelected ? 210 : 70);
        const blockCenterY = top + (isSelected ? 110 : 29);
        const deltaX = blockCenterX - 540;
        const deltaY = blockCenterY - 255;
        const distance = Math.hypot(deltaX, deltaY) || 1;
        const anchorX = 540 + (deltaX / distance) * 84;
        const anchorY = 255 + (deltaY / distance) * 84;
        const endpointX = left;
        const controlSpan = Math.max(36, Math.min(100, (endpointX - anchorX) * .42));
        link?.setAttribute('d', `M${anchorX.toFixed(1)} ${anchorY.toFixed(1)} C${(anchorX + controlSpan).toFixed(1)} ${anchorY.toFixed(1)} ${(endpointX - controlSpan).toFixed(1)} ${blockCenterY} ${endpointX} ${blockCenterY}`);
      }
    });
  };

  const collapseProjectBlocks = () => {
    projectIsCollapsed = true;
    projectCanvas.classList.add('is-project-collapsed');
    projectCanvas.classList.remove('is-project-focused');
    projectBlocks.forEach((block) => {
      block.classList.remove('is-expanded', 'is-focused', 'is-highlighted');
      block.setAttribute('aria-expanded', 'false');
      block.style.left = '470px';
      block.style.top = '226px';
    });
    projectLinks.forEach((link) => link.classList.remove('is-linked', 'is-focused'));
    projectCore?.setAttribute('aria-expanded', 'false');
    if (coreSummary) coreSummary.textContent = '6 drawings collapsed · click to restore';
    updateSemanticCaption('03 / PROJECT', '六張圖面已收回 PROJECT 001 核心；再次點擊 001 即可恢復先前的圖面配置。');
  };

  const restoreProjectBlocks = () => {
    projectIsCollapsed = false;
    projectCanvas.classList.remove('is-project-collapsed');
    layoutProjectBlocks(expandedProjectKey);
    projectBlocks.forEach((block) => block.classList.add('is-arrived'));
    projectLinks.forEach((link) => link.classList.add('is-linked'));
    projectCore?.setAttribute('aria-expanded', 'true');
    projectCore?.classList.remove('is-highlighted');
    if (coreSummary) coreSummary.textContent = '6 drawings · click to collapse';
    const selectedBlock = projectCanvas.querySelector(`[data-project-block="${expandedProjectKey}"]`);
    updateSemanticCaption('03 / PROJECT', selectedBlock?.dataset.detail || semanticDefaults.project[1]);
  };

  const clearProjectGuide = () => {
    projectGuideTimers.forEach((timer) => window.clearTimeout(timer));
    projectGuideTimers = [];
    projectIsCollapsed = false;
    projectCanvas.classList.remove('is-project-collapsed');
    layoutProjectBlocks('a201');
    projectBlocks.forEach((block) => block.classList.remove('is-arrived', 'is-focused'));
    projectLinks.forEach((link) => link.classList.remove('is-linked', 'is-focused'));
    projectCore?.classList.remove('is-lit', 'is-locking');
    projectCore?.setAttribute('aria-expanded', 'true');
    if (coreSummary) coreSummary.textContent = '6 drawings · click to collapse';
    projectCanvas.classList.remove('is-project-focused');
    projectCanvas.dataset.projectState = 'idle';
  };

  const arriveProjectBlock = (key) => {
    projectCanvas.querySelector(`[data-project-block="${key}"]`)?.classList.add('is-arrived');
  };

  const connectProjectBlock = (key) => {
    projectCanvas.querySelector(`[data-project-link="${key}"]`)?.classList.add('is-linked');
  };

  const completeProjectGuide = () => {
    layoutProjectBlocks('a201');
    projectBlocks.forEach((block) => block.classList.add('is-arrived'));
    projectLinks.forEach((link) => link.classList.add('is-linked'));
    projectCore?.classList.add('is-lit');
    projectCanvas.dataset.projectState = 'complete';
  };

  runProjectGuide = ({ force = false } = {}) => {
    if (projectCanvas.dataset.projectState === 'complete' && !force) return;
    clearProjectGuide();

    if (semanticMotionReduced) {
      completeProjectGuide();
      return;
    }

    projectCanvas.dataset.projectState = 'playing';
    projectGuideTimers.push(window.setTimeout(() => mainBlock?.classList.add('is-arrived'), 100));
    projectGuideTimers.push(window.setTimeout(() => mainLink?.classList.add('is-linked'), 650));
    projectGuideTimers.push(window.setTimeout(() => {
      projectCore?.classList.add('is-lit', 'is-locking');
      updateSemanticCaption('03 / PROJECT', 'A201-R24 已連接並點亮 PROJECT 001；其他圖面將在核心右側依序補入。');
    }, 1120));
    projectGuideTimers.push(window.setTimeout(() => projectCore?.classList.remove('is-locking'), 1700));

    secondaryOrder.forEach((key, index) => {
      const arrivalTime = 1420 + index * 440;
      projectGuideTimers.push(window.setTimeout(() => arriveProjectBlock(key), arrivalTime));
      projectGuideTimers.push(window.setTimeout(() => connectProjectBlock(key), arrivalTime + 220));
    });

    const projectGuideCompleteTime = 1420 + secondaryOrder.length * 440;
    projectGuideTimers.push(window.setTimeout(() => {
      projectCanvas.dataset.projectState = 'complete';
      updateSemanticCaption('03 / PROJECT', 'PROJECT 001 同時包含同來源與不同來源的 Request；每張 Request 都由對應的 Discipline Lead 審核。');
    }, projectGuideCompleteTime));
  };

  const focusProjectRelation = (block) => {
    if (projectIsCollapsed) return;
    const selectedBlock = projectCanvas.querySelector(`[data-project-block="${expandedProjectKey}"]`);
    const selectedLink = projectCanvas.querySelector(`[data-project-link="${expandedProjectKey}"]`);
    if (!selectedBlock) return;
    projectCanvas.classList.add('is-project-focused');
    projectBlocks.forEach((item) => item.classList.remove('is-focused'));
    projectLinks.forEach((link) => link.classList.remove('is-focused'));
    selectedBlock.classList.add('is-focused', 'is-highlighted');
    selectedLink?.classList.add('is-focused');
  };

  const restoreProjectRelation = () => {
    projectBlocks.forEach((item) => item.classList.remove('is-focused'));
    projectLinks.forEach((link) => link.classList.remove('is-focused'));
    projectCanvas.classList.remove('is-project-focused');
    const selectedBlock = projectCanvas.querySelector(`[data-project-block="${expandedProjectKey}"]`);
    selectedBlock?.classList.add('is-highlighted');
    updateSemanticCaption('03 / PROJECT', selectedBlock?.dataset.detail || semanticDefaults.project[1]);
  };

  projectBlocks.forEach((block) => {
    block.addEventListener('mouseenter', () => focusProjectRelation(block));
    block.addEventListener('focus', () => focusProjectRelation(block));
    block.addEventListener('mouseleave', restoreProjectRelation);
    block.addEventListener('blur', restoreProjectRelation);
  });

  projectBlocks.forEach((block) => {
    block.addEventListener('click', () => {
      if (projectIsCollapsed) return;
      projectBlocks.forEach((item) => item.classList.remove('is-highlighted', 'is-focused'));
      projectLinks.forEach((link) => link.classList.remove('is-focused'));
      layoutProjectBlocks(block.dataset.projectBlock);
      block.classList.add('is-highlighted');
      focusProjectRelation(block);
      updateSemanticCaption('03 / PROJECT', block.dataset.detail);
    });
  });

  projectCore?.addEventListener('click', () => {
    if (projectCanvas.dataset.projectState === 'playing') {
      projectGuideTimers.forEach((timer) => window.clearTimeout(timer));
      projectGuideTimers = [];
      completeProjectGuide();
    }
    if (projectIsCollapsed) restoreProjectBlocks();
    else collapseProjectBlocks();
  });

  layoutProjectBlocks('a201');
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

/* ==========================================================================
   UI 逻辑：信息面板 / 右键菜单 / 源码浮层 / HUD / 引导
   ========================================================================== */

const UI = (() => {
  const panel = document.getElementById('panel');
  const panelBody = document.getElementById('panel-body');
  const panelCrumb = document.getElementById('panel-crumb');
  const ctxmenu = document.getElementById('ctxmenu');
  const sourceOverlay = document.getElementById('source-overlay');
  const sourceFile = document.getElementById('source-file');
  const sourceCode = document.getElementById('source-code');
  const nodelist = document.getElementById('nodelist');
  const nodelistBody = document.getElementById('nodelist-body');

  let ctxNodeId = null;      // 右键命中的节点
  let ctxX = 0, ctxY = 0;

  /* ---------- 面板 ---------- */

  function openPanel() {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
  }
  function closePanel() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    window.K3D && K3D.clearSelection();
  }

  function esc(html) {
    return String(html).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderPanel(nodeId) {
    const n = window.KDATA.nodes[nodeId];
    if (!n) return;

    panelCrumb.textContent = n.kind + '  /  ' + n.id;
    let html = '<div class="p-body">';
    html += '<span class="p-kind">' + esc(n.kind) + '</span>';
    html += '<h2>' + esc(n.name) + '</h2>';
    html += '<div class="p-sub">' + esc(n.en) + '</div>';
    html += '<div class="p-zh">' + esc(n.zh) + '</div>';
    html += n.desc;

    // 源码预览
    if (n.source) {
      html += '<h3>KERNEL SOURCE</h3>';
      html += '<div class="src-preview">';
      html += '<div class="src-head"><span>' + esc(n.source.file) + '</span>' +
              '<button data-act="fullsrc">完整源码 ↗</button></div>';
      // 预览只显示前 12 行
      const lines = n.source.code.split('\n');
      const preview = lines.slice(0, 12).join('\n') +
        (lines.length > 12 ? '\n/* … 共 ' + lines.length + ' 行 */' : '');
      html += '<pre>' + esc(preview) + '</pre>';
      html += '</div>';
    }

    // 设计思路
    if (n.idea) {
      html += '<h3>WHY · 设计思路</h3>';
      html += '<div class="idea-box"><div class="idea-head">DESIGN NOTES</div>' + n.idea + '</div>';
    }

    // 相关节点
    if (n.related && n.related.length) {
      html += '<h3>RELATED</h3><div style="display:flex;flex-wrap:wrap;gap:6px;">';
      for (const rid of n.related) {
        const rn = window.KDATA.nodes[rid];
        if (!rn) continue;
        html += '<button class="chip" data-act="rel" data-id="' + rid + '">' + esc(rn.name) + '</button>';
      }
      html += '</div>';
    }

    html += '</div>';
    panelBody.innerHTML = html;
    openPanel();

    // 面板内按钮绑定
    panelBody.querySelectorAll('[data-act="fullsrc"]').forEach(b => {
      b.addEventListener('click', () => openSource(n));
    });
    panelBody.querySelectorAll('[data-act="rel"]').forEach(b => {
      b.addEventListener('click', () => {
        const rid = b.getAttribute('data-id');
        window.K3D && K3D.focusNode(rid);
        renderPanel(rid);
      });
    });
  }

  /* ---------- 完整源码浮层 ---------- */

  function openSource(node) {
    if (!node.source) return;
    sourceFile.textContent = node.source.file + (node.source.note ? '   ·   ' + node.source.note : '');
    sourceCode.textContent = node.source.code;
    sourceOverlay.hidden = false;
  }
  function closeSource() {
    sourceOverlay.hidden = true;
  }

  /* ---------- 右键菜单 ---------- */

  function openCtx(x, y, nodeId) {
    ctxNodeId = nodeId || null;
    ctxX = x; ctxY = y;
    ctxmenu.hidden = false;
    const w = ctxmenu.offsetWidth, h = ctxmenu.offsetHeight;
    const px = Math.min(x, window.innerWidth - w - 8);
    const py = Math.min(y, window.innerHeight - h - 8);
    ctxmenu.style.left = px + 'px';
    ctxmenu.style.top = py + 'px';
    // 有节点：显示聚焦；无节点：只显示返回全景
    ctxmenu.querySelectorAll('.ctx-item[data-action="focus"]').forEach(el => {
      el.style.display = nodeId ? 'block' : 'none';
    });
    ctxmenu.querySelectorAll('.ctx-item[data-action="source"], .ctx-item[data-action="idea"]').forEach(el => {
      el.style.display = nodeId ? 'block' : 'none';
    });
    ctxmenu.querySelector('.ctx-sep').style.display = nodeId ? 'block' : 'none';
  }
  function closeCtx() {
    ctxmenu.hidden = true;
    ctxNodeId = null;
  }

  ctxmenu.addEventListener('click', (e) => {
    const item = e.target.closest('.ctx-item');
    if (!item || item.classList.contains('ctx-sep')) return;
    const act = item.getAttribute('data-action');
    const node = ctxNodeId ? window.KDATA.nodes[ctxNodeId] : null;
    switch (act) {
      case 'source':
        if (node && node.source) openSource(node);
        else if (node) { renderPanel(ctxNodeId); }
        break;
      case 'idea':
        if (node) renderPanel(ctxNodeId);
        break;
      case 'focus':
        if (node && window.K3D) { window.K3D.focusNode(ctxNodeId); renderPanel(ctxNodeId); }
        break;
      case 'reset':
        window.K3D && window.K3D.setView('panorama');
        closePanel();
        break;
    }
    closeCtx();
  });

  /* ---------- 文字版目录（降级浏览 / 快速跳转） ---------- */

  function openNodeList() {
    const groups = {};
    for (const id of Object.keys(window.KDATA.nodes)) {
      const n = window.KDATA.nodes[id];
      const g = n.kind.split('·')[0].trim();
      (groups[g] = groups[g] || []).push(n);
    }
    let html = '';
    for (const g of Object.keys(groups)) {
      html += '<div class="nodelist-group"><div class="nodelist-group-title">' + g + '</div>';
      for (const n of groups[g]) {
        html += '<button class="nodelist-item" data-id="' + n.id + '">' + esc(n.name) + '</button>';
      }
      html += '</div>';
    }
    nodelistBody.innerHTML = html;
    nodelistBody.querySelectorAll('.nodelist-item').forEach(b => {
      b.addEventListener('click', () => {
        closeNodeList();
        renderPanel(b.getAttribute('data-id'));
      });
    });
    nodelist.hidden = false;
  }
  function closeNodeList() { nodelist.hidden = true; }
  document.getElementById('nodelist-close').addEventListener('click', closeNodeList);
  document.getElementById('nogl-link').addEventListener('click', (e) => {
    e.preventDefault();
    openNodeList();
  });

  /* ---------- 全局事件 ---------- */

  document.addEventListener('click', (e) => {
    if (!ctxmenu.hidden && !ctxmenu.contains(e.target)) closeCtx();
    if (!sourceOverlay.hidden && !sourceOverlay.contains(e.target) && e.target.id !== 'source-close') {
      // 点击浮层外部空白关闭
      if (e.target === sourceOverlay) closeSource();
    }
  });
  document.addEventListener('contextmenu', (e) => {
    if (!sourceOverlay.hidden && sourceOverlay.contains(e.target)) {
      e.preventDefault();
      return;
    }
    if (!ctxmenu.hidden) { e.preventDefault(); closeCtx(); return; }
    // 交给 main.js 的 raycast 处理，若未命中则显示全局菜单
    if (window.K3D && window.K3D.onSceneContextMenu) {
      const hit = window.K3D.onSceneContextMenu(e);
      if (hit !== false) e.preventDefault();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCtx();
      if (!sourceOverlay.hidden) closeSource();
      else if (panel.classList.contains('open')) closePanel();
      else if (!nodelist.hidden) closeNodeList();
      else {
        const ob = document.getElementById('onboard');
        if (ob && !ob.classList.contains('gone')) hideOnboard();
      }
    }
  });

  document.getElementById('panel-close').addEventListener('click', closePanel);
  document.getElementById('source-close').addEventListener('click', closeSource);
  document.getElementById('btn-help').addEventListener('click', () => {
    const ob = document.getElementById('onboard');
    ob.classList.remove('hide', 'gone');
    ob.style.pointerEvents = 'auto';
  });
  document.getElementById('btn-reset').addEventListener('click', () => {
    window.K3D && window.K3D.setView('panorama');
    closePanel();
  });

  /* ---------- 引导关闭（多种途径，确保一定能关掉） ---------- */
  function hideOnboard() {
    const ob = document.getElementById('onboard');
    if (!ob) return;
    ob.classList.add('hide');
    setTimeout(() => ob.classList.add('gone'), 550);
  }
  document.getElementById('onboard-enter').addEventListener('click', hideOnboard);
  document.getElementById('onboard-x').addEventListener('click', hideOnboard);
  document.getElementById('onboard').addEventListener('click', (e) => {
    // 点击遮罩空白处（不在盒子内）也关闭
    if (e.target.id === 'onboard') hideOnboard();
  });
  // 15 秒未操作则自动收起
  setTimeout(hideOnboard, 15000);

  // 视图 tabs
  document.getElementById('views').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-btn');
    if (!btn) return;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const v = btn.getAttribute('data-view');
    window.K3D && window.K3D.setView(v);
    closePanel();
  });

  function setStatus(sel) {
    document.getElementById('st-sel').textContent = sel;
  }
  function setViewName(name) {
    document.getElementById('st-view').textContent = name;
  }

  return {
    renderPanel, closePanel, openSource, closeSource,
    openCtx, closeCtx, setStatus, setViewName,
  };
})();

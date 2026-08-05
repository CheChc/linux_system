/* ==========================================================================
   K3D — CSS3D 渲染版本（降级模式）
   无 WebGL 环境下的 3D 场景：用 CSS transform 渲染"卡片墙"式分层架构。
   与 WebGL 版共享同一套 K3D 接口（setView / focusNode / clearSelection...）。
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------- 场景 ---------------- */
  const container = document.getElementById('scene-container');
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 5000);
  camera.position.set(0, 430, 1080);

  const renderer = new THREE.CSS3DRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = '0';
  renderer.domElement.style.overflow = 'hidden';
  container.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 260;
  controls.maxDistance = 2600;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.target.set(0, 160, 0);
  // 按键映射：左键=平移(换位置)、中键=旋转、右键=缩放；滚轮=缩放
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.DOLLY,
  };
  controls.touches = {
    ONE: THREE.TOUCH.PAN,
    TWO: THREE.TOUCH.DOLLY_ROTATE,
  };

  /* ---------------- 工具 ---------------- */

  const S = 60; // 坐标缩放：WebGL 世界 ×60 → CSS3D 世界（像素感）

  function makeCard(nodeId, w, h, opts) {
    opts = opts || {};
    const div = document.createElement('div');
    div.className = 'c3d-card' + (opts.cls ? ' ' + opts.cls : '');
    div.style.width = w + 'px';
    div.style.height = h + 'px';
    if (opts.bg) div.style.background = opts.bg;
    if (opts.border) div.style.borderColor = opts.border;
    if (opts.fontSize) div.style.fontSize = opts.fontSize + 'px';
    if (nodeId) div.dataset.node = nodeId;
    div.innerHTML = '<span class="c3d-name">' + (opts.name || '') + '</span>' +
                    (opts.sub ? '<span class="c3d-sub">' + opts.sub + '</span>' : '');
    const obj = new THREE.CSS3DObject(div);
    if (nodeId) {
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        focusNode(nodeId);
        UI.renderPanel(nodeId);
      });
      div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        UI.openCtx(e.clientX, e.clientY, nodeId);
      });
      div.addEventListener('mouseenter', () => div.classList.add('hov'));
      div.addEventListener('mouseleave', () => div.classList.remove('hov'));
    }
    return obj;
  }

  function makeDeck(w, h, cls, name, sub) {
    const div = document.createElement('div');
    div.className = 'c3d-deck ' + (cls || '');
    div.style.width = w + 'px';
    div.style.height = h + 'px';
    div.innerHTML = '<div class="c3d-deck-name">' + name + '</div>' +
                    (sub ? '<div class="c3d-deck-sub">' + sub + '</div>' : '');
    return new THREE.CSS3DObject(div);
  }

  function place(obj, x, y, z, rx, ry, rz) {
    obj.position.set(x * S, y * S, z * S);
    if (rx) obj.rotation.x = rx;
    if (ry) obj.rotation.y = ry;
    if (rz) obj.rotation.z = rz;
    return obj;
  }

  /* ---------------- 组 ---------------- */
  const groupHardware = new THREE.Group(); scene.add(groupHardware);
  const groupKernel = new THREE.Group();   scene.add(groupKernel);
  const groupUser = new THREE.Group();     scene.add(groupUser);
  const groupFS = new THREE.Group();       scene.add(groupFS);
  const groupMem = new THREE.Group();      scene.add(groupMem);

  /* ---------------- 构建：硬件层 ---------------- */
  function buildHardware() {
    // 层板
    const deck = makeDeck(760, 520, 'deck-hard', 'HARDWARE · 硬件层');
    place(deck, 0, 0.15, 0, -Math.PI / 2);
    groupHardware.add(deck);

    // CPU / RAM / Disk 卡片（数据流横排）
    const cpu = makeCard('hw-cpu', 150, 70, { name: 'CPU', sub: '特权级 · MMU', cls: 'c3d-metal' });
    place(cpu, -3.4, 1.15, 0.4);
    groupHardware.add(cpu);

    const ram = makeCard('hw-ram', 150, 70, { name: 'RAM', sub: '物理内存 · 页框', cls: 'c3d-term' });
    place(ram, -0.6, 1.15, 1.5);
    groupHardware.add(ram);

    const disk = makeCard('hw-disk', 150, 70, { name: 'DISK', sub: '块设备 · 页缓存', cls: 'c3d-metal' });
    place(disk, 3.6, 1.15, 0.2);
    groupHardware.add(disk);
  }

  /* ---------------- 构建：内核层 ---------------- */
  const kernelCards = [
    // 行1：四大核心
    { id: 'k-sched', name: 'SCHED', sub: '进程调度', pos: [-3.5, 3.15, 1.3] },
    { id: 'k-mm',    name: 'MM',    sub: '内存管理', pos: [-1.17, 3.15, 1.3] },
    { id: 'k-vfs',   name: 'VFS',   sub: '虚拟文件系统', pos: [1.17, 3.15, 1.3] },
    { id: 'k-net',   name: 'NET',   sub: '网络协议栈', pos: [3.5, 3.15, 1.3] },
    // 行2：文件数据流链路
    { id: 'k-irq',       name: 'IRQ',     sub: '中断处理', pos: [-3.5, 3.15, 0] },
    { id: 'k-pagecache', name: 'PCACHE',  sub: '页缓存', pos: [-1.17, 3.15, 0] },
    { id: 'k-ext4',      name: 'EXT4',    sub: '具体文件系统', pos: [1.17, 3.15, 0] },
    { id: 'k-block',     name: 'BLOCK',   sub: '块设备层', pos: [3.5, 3.15, 0] },
    // 行3：IPC/凭据/驱动/启动
    { id: 'k-ipc',      name: 'IPC',  sub: '进程通信', pos: [-3.5, 3.15, -1.3] },
    { id: 'k-cred',     name: 'CRED', sub: '凭据能力', pos: [-1.17, 3.15, -1.3] },
    { id: 'k-drivers',  name: 'DRV',  sub: '设备驱动', pos: [1.17, 3.15, -1.3] },
    { id: 'k-init',     name: 'INIT', sub: '内核启动', pos: [3.5, 3.15, -1.3] },
  ];

  function buildKernel() {
    const deck = makeDeck(660, 400, 'deck-kernel', 'KERNEL · 内核态', 'ring 0');
    place(deck, 0, 2.6, 0, -Math.PI / 2);
    groupKernel.add(deck);

    kernelCards.forEach(c => {
      const card = makeCard(c.id, 112, 52, { name: c.name, sub: c.sub, cls: 'c3d-kernel' });
      place(card, c.pos[0], c.pos[1], c.pos[2]);
      groupKernel.add(card);
    });

    // 系统调用入口
    const sc = makeCard('sc-overview', 200, 44, { name: 'SYSCALL · 系统调用', sub: '用户态 → 内核态入口', cls: 'c3d-gate' });
    place(sc, 0, 4.05, 0);
    groupKernel.add(sc);

    // read() 实例：数据流动画入口
    const readCard = makeCard('sc-read', 120, 40, { name: 'READ 实例', sub: 'read() 数据流', cls: 'c3d-gate' });
    place(readCard, 0, 4.1, 2.3);
    groupKernel.add(readCard);
  }

  /* ---------------- 构建：用户层 ---------------- */
  const userCards = [
    { id: 'proc-model', name: 'bash',   sub: '进程 = PCB', pos: [-2.5, 6.15, 1.5] },
    { id: 'proc-fork',  name: 'vim',    sub: 'fork 创建',  pos: [0.0, 6.15, 1.6] },
    { id: 'proc-exec',  name: 'nginx',  sub: 'exec 换镜像', pos: [2.5, 6.15, 1.5] },
    { id: 'proc-life',  name: 'sshd',   sub: '生命周期',   pos: [-2.5, 6.15, -1.5] },
    { id: 'proc-ctx',   name: 'gcc',    sub: '上下文切换', pos: [0.0, 6.15, -1.6] },
    { id: 'proc-addr',  name: 'chrome', sub: '地址空间',   pos: [2.5, 6.15, -1.5] },
  ];

  function buildUser() {
    const deck = makeDeck(580, 580, 'deck-user', 'USER · 用户态', 'ring 3');
    place(deck, 0, 5.45, 0, -Math.PI / 2);
    groupUser.add(deck);

    // libc：圆盘中央（进程与系统调用之间）
    const libc = makeCard('k-libc', 130, 50, { name: 'LIBC', sub: '系统调用封装', cls: 'c3d-user' });
    place(libc, 0, 5.5, 0);
    groupUser.add(libc);

    userCards.forEach(c => {
      const card = makeCard(c.id, 128, 60, { name: c.name, sub: c.sub, cls: 'c3d-user' });
      place(card, c.pos[0], c.pos[1], c.pos[2]);
      groupUser.add(card);
    });
  }

  /* ---------------- 构建：目录树 ---------------- */
  const fsDefs = [
    { id: 'fs-root', name: '/', x: 0, y: 0, d: 0, cls: 'c3d-fs-root' },
    { id: 'fs-bin', name: '/bin', x: -2.0, y: 1.5, d: -0.6, cls: 'c3d-fs' },
    { id: 'fs-etc', name: '/etc', x: -0.6, y: 1.5, d: 1.5, cls: 'c3d-fs' },
    { id: 'fs-home', name: '/home', x: 1.4, y: 1.5, d: 1.4, cls: 'c3d-fs' },
    { id: 'fs-usr', name: '/usr', x: 2.2, y: 1.5, d: -0.8, cls: 'c3d-fs' },
    { id: 'fs-var', name: '/var', x: -0.4, y: 1.5, d: -2.0, cls: 'c3d-fs' },
    { id: 'fs-dev', name: '/dev', x: -1.8, y: 3.0, d: 0.9, cls: 'c3d-fs' },
    { id: 'fs-proc', name: '/proc', x: 0.4, y: 3.0, d: 1.9, cls: 'c3d-fs' },
    { id: 'fs-sys', name: '/sys', x: 2.0, y: 3.0, d: 1.4, cls: 'c3d-fs' },
    { id: 'fs-tmp', name: '/tmp', x: 2.4, y: 3.0, d: -0.9, cls: 'c3d-fs' },
    { id: 'fs-lib', name: '/lib', x: 0.2, y: 3.0, d: -1.6, cls: 'c3d-fs' },
    { id: 'fs-boot', name: '/boot', x: -1.3, y: 4.4, d: 0.1, cls: 'c3d-fs' },
    { id: 'fs-root2', name: '/root', x: 1.3, y: 4.4, d: 1.2, cls: 'c3d-fs' },
  ];

  function buildFS() {
    fsDefs.forEach(f => {
      const card = makeCard(f.id, 96, 46, { name: f.name, cls: f.cls });
      place(card, -8.6 + f.x, 1.0 + f.y * 0.9, f.d);
      groupFS.add(card);
    });
    // 层名
    const tag = makeDeck(320, 60, 'deck-fs-tag', 'FILESYSTEM · 目录树');
    place(tag, -8.6, 5.9, 0);
    groupFS.add(tag);
  }

  /* ---------------- 构建：内存视图 ---------------- */
  function buildMem() {
    const gx = 8.2;
    const deck = makeDeck(560, 380, 'deck-mem', 'MEMORY · 内存管理');
    place(deck, gx, 0.2, 0, -Math.PI / 2);
    groupMem.add(deck);

    // 地址空间柱（一个竖卡片，内含分段色块）
    const addrDiv = document.createElement('div');
    addrDiv.className = 'c3d-card c3d-addr';
    addrDiv.style.width = '150px';
    addrDiv.style.height = '420px';
    addrDiv.dataset.node = 'proc-addr';
    addrDiv.innerHTML =
      '<div class="c3d-addr-seg" style="flex:1.5;background:#496071;" title="stack 栈 ↓">stack</div>' +
      '<div class="c3d-addr-seg" style="flex:0.9;background:#5c7484;" title="mmap 共享库">mmap</div>' +
      '<div class="c3d-addr-seg" style="flex:1.7;background:#66849a;" title="heap 堆 ↑">heap</div>' +
      '<div class="c3d-addr-seg" style="flex:0.6;background:#5c7484;" title="data 数据">data</div>' +
      '<div class="c3d-addr-seg" style="flex:0.9;background:#9cc39a;" title="text 代码">text</div>';
    addrDiv.addEventListener('click', (e) => { e.stopPropagation(); focusNode('proc-addr'); UI.renderPanel('proc-addr'); });
    addrDiv.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); UI.openCtx(e.clientX, e.clientY, 'proc-addr'); });
    const addrObj = new THREE.CSS3DObject(addrDiv);
    place(addrObj, gx - 2.6, 3.3, 0);
    groupMem.add(addrObj);

    // 页表板
    const ptDiv = document.createElement('div');
    ptDiv.className = 'c3d-card c3d-pt';
    ptDiv.style.width = '260px';
    ptDiv.style.height = '190px';
    ptDiv.dataset.node = 'mem-page';
    ptDiv.innerHTML = '<span class="c3d-name">页表 PTE</span><span class="c3d-sub">虚拟地址 → 物理地址</span>';
    ptDiv.addEventListener('click', (e) => { e.stopPropagation(); focusNode('mem-page'); UI.renderPanel('mem-page'); });
    ptDiv.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); UI.openCtx(e.clientX, e.clientY, 'mem-page'); });
    const ptObj = new THREE.CSS3DObject(ptDiv);
    place(ptObj, gx, 3.4, 0);
    groupMem.add(ptObj);

    // 物理页框排
    for (let i = 0; i < 10; i++) {
      const fx = (i - 4.5) * 0.62;
      const frame = makeCard('mem-virt', 34, 30, { name: String(i + 1), cls: 'c3d-frame' });
      place(frame, gx + fx, 0.75, 0);
      groupMem.add(frame);
    }
  }

  /* ---------------- 构建 ---------------- */
  buildHardware();
  buildKernel();
  buildUser();
  buildFS();
  buildMem();

  /* ---------------- 视图管理 ---------------- */

  const VIEW_DEFS = {
    panorama: { pos: [0, 7.2, 17.5], look: [0, 2.6, 0], show: { hw: true, kernel: true, user: true, fs: true, mem: false } },
    kernel:   { pos: [0, 4.6, 9.5],  look: [0, 2.6, 0], show: { hw: true, kernel: true, user: false, fs: false, mem: false } },
    fs:       { pos: [-4.2, 3.6, 8.2], look: [-8.4, 3.0, 0], show: { hw: false, kernel: false, user: false, fs: true, mem: false } },
    process:  { pos: [0, 6.2, 9.0],  look: [0, 5.2, 0], show: { hw: true, kernel: true, user: true, fs: false, mem: false } },
    memory:   { pos: [7.8, 5.0, 9.8], look: [7.8, 2.8, 0], show: { hw: false, kernel: false, user: false, fs: false, mem: true } },
    user:     { pos: [0, 6.2, 9.6],  look: [0, 5.3, 0], show: { hw: true, kernel: true, user: true, fs: false, mem: false } },
  };

  const VIEW_NAMES = { panorama: '全景', kernel: '内核态', fs: '目录树', process: '进程', memory: '内存', user: '用户' };

  function applyViewShow(v) {
    const d = VIEW_DEFS[v];
    groupHardware.visible = d.show.hw;
    groupKernel.visible = d.show.kernel;
    groupUser.visible = d.show.user;
    groupFS.visible = d.show.fs;
    groupMem.visible = d.show.mem;
  }

  /* ---------------- 相机动画 ---------------- */
  let camAnim = null;
  function flyTo(pos, look, dur) {
    camAnim = {
      t: 0, dur: dur || 900,
      fromPos: camera.position.clone(),
      toPos: new THREE.Vector3(pos[0] * S, pos[1] * S, pos[2] * S),
      fromLook: controls.target.clone(),
      toLook: new THREE.Vector3(look[0] * S, look[1] * S, look[2] * S),
    };
  }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  let currentView = 'panorama';

  function setView(v) {
    if (!VIEW_DEFS[v]) return;
    currentView = v;
    applyViewShow(v);
    UI.setViewName(VIEW_NAMES[v]);
    const d = VIEW_DEFS[v];
    flyTo(d.pos, d.look);
    document.querySelectorAll('.view-btn').forEach(b =>
      b.classList.toggle('active', b.getAttribute('data-view') === v));
  }

  /* ---------------- 选中 / hover ---------------- */
  let selectedEl = null;

  function selectNode(nodeId) {
    clearSelection();
    if (!nodeId) return;
    const cards = renderer.domElement.querySelectorAll('.c3d-card[data-node="' + nodeId + '"]');
    if (cards.length) {
      selectedEl = cards[0];
      selectedEl.classList.add('sel');
    }
    drawRelations(nodeId);
  }

  function clearSelection() {
    if (selectedEl) {
      selectedEl.classList.remove('sel');
      selectedEl = null;
    }
    clearRelations();
  }

  /* ---------------- 关系连线（SVG 投影，跟随旋转） ---------------- */
  const svgNS = 'http://www.w3.org/2000/svg';
  const svgLayer = document.createElementNS(svgNS, 'svg');
  svgLayer.setAttribute('class', 'c3d-relations');
  svgLayer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;overflow:hidden;';
  document.getElementById('scene-css-layer').appendChild(svgLayer);

  const LAYER = { kernel: 'k', syscall: 'k', proc: 'u', user: 'u', mem: 'm', fs: 'f', hw: 'h' };
  const relLines = [];      // {line, idA, idB}
  const relDimmed = new Set();  // 被淡化的卡片元素

  function findCSS3D(nodeId) {
    let found = null;
    scene.traverse(o => {
      if (!found && o.isCSS3DObject && o.element && o.element.dataset && o.element.dataset.node === nodeId) found = o;
    });
    return found;
  }

  function drawRelations(nodeId) {
    clearRelations();
    const node = window.KDATA.nodes[nodeId];
    if (!node || !node.related || !node.related.length) return;

    // 无关卡片淡化
    const relatedSet = new Set(node.related);
    relatedSet.add(nodeId);
    renderer.domElement.querySelectorAll('.c3d-card').forEach(card => {
      const id = card.dataset.node;
      if (id && !relatedSet.has(id)) {
        card.classList.add('dim');
        relDimmed.add(card);
      }
    });

    // 相关卡片高亮 + 建立连线
    node.related.forEach(rid => {
      const rn = window.KDATA.nodes[rid];
      if (!rn) return;
      renderer.domElement.querySelectorAll('.c3d-card[data-node="' + rid + '"]')
        .forEach(c => c.classList.add('rel'));
      const same = LAYER[node.type] === LAYER[rn.type];
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('stroke', same ? '#d9a05b' : '#8aa8bd');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-opacity', same ? '0.75' : '0.8');
      if (!same) line.setAttribute('stroke-dasharray', '6 5');
      svgLayer.appendChild(line);
      relLines.push({ line, idA: nodeId, idB: rid });
    });

    // 数据流动画（如有 path）
    if (node.path && node.path.length) startFlow(nodeId);
  }

  function clearRelations() {
    relLines.forEach(r => r.line.remove());
    relLines.length = 0;
    relDimmed.forEach(card => card.classList.remove('dim'));
    relDimmed.clear();
    renderer.domElement.querySelectorAll('.c3d-card.rel').forEach(c => c.classList.remove('rel'));
    stopFlow();
  }

  /* ---------------- 数据流动画（SVG 投影） ---------------- */
  let flowState = null;

  function startFlow(nodeId) {
    stopFlow();
    const node = window.KDATA.nodes[nodeId];
    if (!node || !node.path || !node.path.length) return;
    const ids = node.path.filter(id => findCSS3D(id));
    if (ids.length < 2) return;
    // 世界坐标点
    const pts = ids.map(id => {
      const o = findCSS3D(id);
      const v = new THREE.Vector3();
      o.getWorldPosition(v);
      return v;
    });
    // 轨迹（虚线）
    const trail = document.createElementNS(svgNS, 'polyline');
    trail.setAttribute('stroke', '#e9bc82');
    trail.setAttribute('stroke-width', '1.2');
    trail.setAttribute('stroke-dasharray', '5 4');
    trail.setAttribute('fill', 'none');
    trail.setAttribute('stroke-opacity', '0.6');
    svgLayer.appendChild(trail);
    // 光点（4 个）
    const circles = [];
    for (let i = 0; i < 4; i++) {
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('r', '4.5');
      c.setAttribute('fill', i % 2 ? '#e9bc82' : '#9cc39a');
      c.setAttribute('fill-opacity', '0.95');
      svgLayer.appendChild(c);
      circles.push(c);
    }
    // 各段长度
    const segLens = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const l = pts[i].distanceTo(pts[i + 1]);
      segLens.push(l);
      total += l;
    }
    flowState = { pts, segLens, total, circles, trail, t: 0 };
  }

  function updateFlow(dt) {
    if (!flowState) return;
    flowState.t += dt * 2.4;
    const { pts, segLens, total, circles, trail } = flowState;
    const w = window.innerWidth, h = window.innerHeight;
    // 轨迹投影
    const screenPts = pts.map(p => {
      const v = p.clone().project(camera);
      return (((v.x + 1) / 2) * w).toFixed(1) + ',' + (((1 - v.y) / 2) * h).toFixed(1);
    });
    trail.setAttribute('points', screenPts.join(' '));
    // 光点
    const L = total || 1;
    for (let i = 0; i < circles.length; i++) {
      let d = (flowState.t + (i * L) / circles.length) % L;
      const pos = new THREE.Vector3();
      let acc = 0;
      for (let s = 0; s < segLens.length; s++) {
        if (d <= acc + segLens[s] || s === segLens.length - 1) {
          const frac = segLens[s] ? Math.min(1, (d - acc) / segLens[s]) : 0;
          pos.lerpVectors(pts[s], pts[s + 1], frac);
          break;
        }
        acc += segLens[s];
      }
      const v = pos.clone().project(camera);
      circles[i].setAttribute('cx', ((v.x + 1) / 2) * w);
      circles[i].setAttribute('cy', ((1 - v.y) / 2) * h);
    }
  }

  function stopFlow() {
    if (flowState) {
      flowState.circles.forEach(c => c.remove());
      flowState.trail.remove();
      flowState = null;
    }
  }

  // 每帧把 3D 关系线投影到屏幕坐标（跟随旋转/缩放）
  function updateRelationLines() {
    if (!relLines.length) return;
    const w = window.innerWidth, h = window.innerHeight;
    for (const r of relLines) {
      const a = findCSS3D(r.idA), b = findCSS3D(r.idB);
      if (!a || !b) { r.line.style.display = 'none'; continue; }
      const pa = new THREE.Vector3(); a.getWorldPosition(pa); pa.project(camera);
      const pb = new THREE.Vector3(); b.getWorldPosition(pb); pb.project(camera);
      if (pa.z > 1 || pb.z > 1) { r.line.style.display = 'none'; continue; }
      r.line.style.display = '';
      r.line.setAttribute('x1', ((pa.x + 1) / 2) * w);
      r.line.setAttribute('y1', ((1 - pa.y) / 2) * h);
      r.line.setAttribute('x2', ((pb.x + 1) / 2) * w);
      r.line.setAttribute('y2', ((1 - pb.y) / 2) * h);
    }
  }

  function focusNode(nodeId) {
    // 找对象位置
    let found = null;
    scene.traverse(o => {
      if (!found && o.isCSS3DObject && o.element && o.element.dataset && o.element.dataset.node === nodeId) found = o;
    });
    if (!found) return;
    const wp = new THREE.Vector3();
    found.getWorldPosition(wp);
    const dir = wp.clone().sub(camera.position).normalize();
    const camPos = wp.clone().add(dir.multiplyScalar(-260)).add(new THREE.Vector3(0, 60, 0));
    flyTo([camPos.x / S, camPos.y / S, camPos.z / S], [wp.x / S, wp.y / S + 0.2, wp.z / S], 700);
    selectNode(nodeId);
    UI.setStatus(window.KDATA.nodes[nodeId] ? window.KDATA.nodes[nodeId].name : nodeId);
  }

  /* ---------------- 空白处交互 ---------------- */
  // 记录按下位置：区分"点击空白"与"拖动结束"（拖动时 click 会冒泡到容器）
  // 注意：pointerup 后 click 才触发，所以按下位置要保留到 click 判断完再重置
  let pointerDownPos3 = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    pointerDownPos3 = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('contextmenu', (e) => {
    // 卡片已自行处理并 stopPropagation；这里处理空白处
    UI.openCtx(e.clientX, e.clientY, null);
  });
  renderer.domElement.addEventListener('click', (e) => {
    if (e.target === renderer.domElement) {
      // 真·点击空白（按下与松开位置接近）才清除选中
      const moved = pointerDownPos3 &&
        (Math.abs(e.clientX - pointerDownPos3.x) + Math.abs(e.clientY - pointerDownPos3.y) > 8);
      if (!moved) {
        UI.setStatus('—');
        clearSelection();
      }
    }
    pointerDownPos3 = null;
  });

  /* ---------------- 渲染循环 ---------------- */
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (camAnim) {
      camAnim.t += dt * 1000;
      const k = Math.min(1, camAnim.t / camAnim.dur);
      const e = easeInOut(k);
      camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, e);
      controls.target.lerpVectors(camAnim.fromLook, camAnim.toLook, e);
      if (k >= 1) camAnim = null;
    }
    controls.update();
    renderer.render(scene, camera);
    updateRelationLines();
    updateFlow(dt);
  }
  animate();

  /* ---------------- 自适应 ---------------- */
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---------------- 接口 ---------------- */
  const K3D = {
    setView, focusNode, selectNode, clearSelection,
    nameOf: (id) => (window.KDATA.nodes[id] ? window.KDATA.nodes[id].name : '—'),
    onSceneContextMenu: null,
    _dbg: { scene, camera, renderer, controls, mode: 'css3d' },
  };
  window.K3D = K3D;

  // 初始视角
  setView('panorama');
})();

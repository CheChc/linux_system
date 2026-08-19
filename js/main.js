/* ==========================================================================
   K3D — Three.js 场景：Linux 分层架构 / 目录树 / 进程 / 内存可视化
   设计语言：暖黑底 + 琥珀(内核态) + 冷蓝灰(用户态) + 金属灰(硬件)
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------- WebGL 可用性检测 ---------------- */
  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  let glTries = 0;

  /* WebGL 不可用/黑屏时回退到 CSS3D 版（无需 GPU，Windows/macOS 全兼容） */
  function fallbackToCSS3D() {
    try {
      const c = document.getElementById('scene-container');
      if (c) c.innerHTML = '';
      const l = document.getElementById('scene-css-layer');
      if (l) l.innerHTML = '';
    } catch (e) { /* ignore */ }
    document.getElementById('nogl').hidden = true;
    document.getElementById('onboard').classList.remove('gone');
    const s = document.createElement('script');
    s.src = 'js/main-css3d.js?v=2';
    document.body.appendChild(s);
  }

  function startScene() {
    const container = document.getElementById('scene-container');

  /* ---------------- 基础场景 ---------------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141a17);
  scene.fog = new THREE.Fog(0x141a17, 46, 76);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0, 6.6, 14.5);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  } catch (e) {
    glTries++;
    if (glTries <= 5) { setTimeout(boot, 400 * glTries); return; }
    fallbackToCSS3D();
    return;
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const cssLayer = document.getElementById('scene-css-layer');
  const cssRenderer = new THREE.CSS2DRenderer();
  cssRenderer.setSize(window.innerWidth, window.innerHeight);
  cssLayer.appendChild(cssRenderer.domElement);

  /* ---------------- 灯光 ---------------- */
  const hemi = new THREE.HemisphereLight(0xe8f0ea, 0x1a201d, 0.85);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfff0dc, 1.25);
  keyLight.position.set(9, 14, 7);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 2; keyLight.shadow.camera.far = 40;
  keyLight.shadow.camera.left = -14; keyLight.shadow.camera.right = 14;
  keyLight.shadow.camera.top = 14; keyLight.shadow.camera.bottom = -14;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x9fc0d8, 0.55);
  fillLight.position.set(-9, 5, -7);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xd9a05b, 0.4);
  rimLight.position.set(-4, -2, 10);
  scene.add(rimLight);

  const bounceLight = new THREE.PointLight(0x9cc39a, 0.5, 30);
  bounceLight.position.set(0, 0.6, 0);
  scene.add(bounceLight);

  /* ---------------- 控制器 ---------------- */
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 42;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.target.set(0, 2.6, 0);
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

  /* ---------------- 工具函数 ---------------- */

  const MAT = {
    amber:     new THREE.MeshStandardMaterial({ color: 0xd9a05b, metalness: 0.25, roughness: 0.5 }),
    amberDeep: new THREE.MeshStandardMaterial({ color: 0xb07d3e, metalness: 0.3, roughness: 0.55 }),
    amberDark: new THREE.MeshStandardMaterial({ color: 0x7d5a2e, metalness: 0.3, roughness: 0.6 }),
    cold:      new THREE.MeshStandardMaterial({ color: 0x8aa8bd, metalness: 0.15, roughness: 0.5 }),
    coldDeep:  new THREE.MeshStandardMaterial({ color: 0x66849a, metalness: 0.2, roughness: 0.55 }),
    coldDark:  new THREE.MeshStandardMaterial({ color: 0x496071, metalness: 0.2, roughness: 0.6 }),
    metal:     new THREE.MeshStandardMaterial({ color: 0x8f9491, metalness: 0.75, roughness: 0.35 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x555a58, metalness: 0.7, roughness: 0.45 }),
    term:      new THREE.MeshStandardMaterial({ color: 0x9cc39a, metalness: 0.1, roughness: 0.5 }),
    pcb:       new THREE.MeshStandardMaterial({ color: 0x1c5c3d, metalness: 0.25, roughness: 0.6 }),
    pcbDark:   new THREE.MeshStandardMaterial({ color: 0x13422c, metalness: 0.25, roughness: 0.65 }),
    glass:     new THREE.MeshStandardMaterial({ color: 0xd9a05b, metalness: 0.1, roughness: 0.2, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }),
    glassCold: new THREE.MeshStandardMaterial({ color: 0x8aa8bd, metalness: 0.1, roughness: 0.2, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }),
  };

  const LINE_COLORS = { wire: 0x232a27, amber: 0x8a6a42, cold: 0x5c7484 };

  function makeLabel(text, cls, nodeId) {
    const div = document.createElement('div');
    div.className = 'css-label' + (cls ? ' ' + cls : '');
    div.textContent = text;
    if (nodeId) {
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.K3D) {
          window.K3D.focusNode(nodeId);
          UI.renderPanel(nodeId);
        }
      });
    }
    return new THREE.CSS2DObject(div);
  }

  function makeBox(w, h, d, mat, nodeId, yOffset) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (nodeId) {
      mesh.userData.nodeId = nodeId;
      mesh.userData.baseEmissive = mat.emissive ? mat.emissive.getHex() : 0x000000;
    }
    return mesh;
  }

  function makeCyl(rt, rb, h, seg, mat, nodeId) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (nodeId) {
      mesh.userData.nodeId = nodeId;
      mesh.userData.baseEmissive = mat.emissive ? mat.emissive.getHex() : 0x000000;
    }
    return mesh;
  }

  function makeLine(points, color, opacity) {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity || 0.7 });
    return new THREE.Line(geo, mat);
  }

  function makeEdges(mesh, color) {
    const edges = new THREE.EdgesGeometry(mesh.geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.35 }));
    line.position.copy(mesh.position);
    line.rotation.copy(mesh.rotation);
    return line;
  }

  /* ---------------- 地面 ---------------- */
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(16, 72),
    new THREE.MeshStandardMaterial({ color: 0x090b0a, metalness: 0.05, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(32, 32, 0x242c27, 0x181e1b);
  grid.position.y = 0.001;
  scene.add(grid);

  /* 地面外环标记（分层刻度） */
  const ringGeo = new THREE.RingGeometry(12.2, 12.35, 96);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x1c2320, transparent: true, opacity: 0.8 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  scene.add(ring);

  /* ---------------- 交互状态 ---------------- */
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = null;
  let selected = null;
  let selectedOutline = null;
  let pointerDownPos = null;
  let camAnim = null;
  let currentView = 'panorama';

  /* ---------------- 组 ---------------- */
  const groupHardware = new THREE.Group(); scene.add(groupHardware);
  const groupKernel = new THREE.Group();   scene.add(groupKernel);
  const groupUser = new THREE.Group();     scene.add(groupUser);
  const groupFS = new THREE.Group();       scene.add(groupFS);
  const groupMem = new THREE.Group();      scene.add(groupMem);
  const groupMachine = new THREE.Group();   scene.add(groupMachine);

  /* ================================================================
     硬件层
     ================================================================ */
  function buildHardware() {
    // 基座
    const base = makeBox(12.6, 0.7, 8.6, MAT.metalDark);
    base.position.set(0, 0.35, 0);
    groupHardware.add(base);
    groupHardware.add(makeEdges(base, 0x2f3833));

    // CPU（左）
    const cpu = makeBox(2.6, 0.9, 2.6, MAT.metal, 'hw-cpu');
    cpu.position.set(-3.4, 1.25, 0.4);
    groupHardware.add(cpu);
    groupHardware.add(makeEdges(cpu, 0x5a635e));
    const cpuDie = makeBox(1.5, 0.14, 1.5, MAT.amberDark);
    cpuDie.position.set(-3.4, 1.77, 0.4);
    groupHardware.add(cpuDie);

    // 内存条（中，横排）
    for (let i = 0; i < 5; i++) {
      const stick = makeBox(0.42, 0.16, 3.2, MAT.term, 'hw-ram');
      stick.position.set(-0.6 + i * 0.5, 1.0, 1.5);
      groupHardware.add(stick);
    }

    // 磁盘（右）
    const disk = makeCyl(1.5, 1.5, 0.5, 40, MAT.metalDark, 'hw-disk');
    disk.position.set(3.6, 1.05, 0.2);
    groupHardware.add(disk);
    const diskTop = makeCyl(1.2, 1.2, 0.06, 40, MAT.metal);
    diskTop.position.set(3.6, 1.33, 0.2);
    groupHardware.add(diskTop);

    // 标签
    const lHard = makeLabel('HARDWARE · 硬件层', 'layer-tag amber');
    lHard.position.set(0, 0.05, 5.8);
    groupHardware.add(lHard);
    const lCpu = makeLabel('CPU', null, 'hw-cpu');
    lCpu.position.set(-3.4, 2.35, 0.4);
    groupHardware.add(lCpu);
    const lRam = makeLabel('RAM', null, 'hw-ram');
    lRam.position.set(-0.6, 1.5, 3.7);
    groupHardware.add(lRam);
    const lDisk = makeLabel('DISK', null, 'hw-disk');
    lDisk.position.set(3.6, 2.1, 0.2);
    groupHardware.add(lDisk);
  }


  /* ================================================================
     整机层（新增）：一台计算机。点击部件 → 钻取对应子系统
     ================================================================ */
  function buildMachine() {
    // ============ 主板 PCB（整块绿色板） ============
    const pcb = makeBox(12.2, 0.18, 8.2, MAT.pcb);
    pcb.position.set(0, 0.1, 0);
    groupMachine.add(pcb);
    groupMachine.add(makeEdges(pcb, 0x0e3320));
    // 板面细节：几条"走线"装饰条
    const trace1 = makeBox(8.5, 0.03, 0.05, MAT.pcbDark);
    trace1.position.set(-1.5, 0.21, 2.2);
    groupMachine.add(trace1);
    const trace2 = makeBox(0.05, 0.03, 5.5, MAT.pcbDark);
    trace2.position.set(2.8, 0.21, -0.8);
    groupMachine.add(trace2);

    // ============ CPU 插座 + 散热器（左中） ============
    const sock = makeBox(2.0, 0.22, 2.0, MAT.metalDark, 'm-cpu');
    sock.position.set(-3.6, 0.32, 1.1);
    groupMachine.add(sock);
    // 散热器：鳍片
    for (let i = 0; i < 5; i++) {
      const fin = makeBox(1.6, 0.1, 0.22, MAT.amberDark, 'm-cpu');
      fin.position.set(-3.6, 0.62 + i * 0.16, 1.1 + (i - 2) * 0.28);
      groupMachine.add(fin);
    }
    // 散热器顶盖
    const hsTop = makeBox(1.5, 0.06, 1.5, MAT.metal, 'm-cpu');
    hsTop.position.set(-3.6, 1.5, 1.1);
    groupMachine.add(hsTop);
    const lCpu = makeLabel('CPU', 'pcb-tag', 'm-cpu');
    lCpu.position.set(-3.6, 1.9, 1.1);
    groupMachine.add(lCpu);

    // ============ 内存插槽 ×4（中排） ============
    for (let i = 0; i < 4; i++) {
      const slot = makeBox(0.55, 0.1, 3.6, MAT.term, 'm-ram');
      slot.position.set(-0.3 + i * 0.85, 0.36, 1.6);
      groupMachine.add(slot);
      // 插槽卡扣
      const clip = makeBox(0.6, 0.18, 0.25, MAT.metalDark, 'm-ram');
      clip.position.set(-0.3 + i * 0.85, 0.5, 3.35);
      groupMachine.add(clip);
    }
    const lRam = makeLabel('RAM ×4', 'pcb-tag', 'm-ram');
    lRam.position.set(0.95, 0.9, 3.7);
    groupMachine.add(lRam);

    // ============ 硬盘位（右中） ============
    const ssd = makeBox(3.0, 0.16, 2.2, MAT.metalDark, 'm-disk');
    ssd.position.set(3.6, 0.34, 1.2);
    groupMachine.add(ssd);
    const lDisk = makeLabel('SSD', 'pcb-tag', 'm-disk');
    lDisk.position.set(3.6, 0.85, 1.2);
    groupMachine.add(lDisk);

    // ============ 电源（右后角） ============
    const psu = makeBox(2.0, 1.1, 3.2, MAT.metalDark, 'm-psu');
    psu.position.set(4.4, 0.85, -2.4);
    groupMachine.add(psu);
    const lPsu = makeLabel('PSU', 'pcb-tag', 'm-psu');
    lPsu.position.set(4.4, 1.7, -2.4);
    groupMachine.add(lPsu);

    // ============ 网卡（左下） ============
    const nic = makeBox(1.4, 0.14, 1.0, MAT.coldDeep, 'm-net');
    nic.position.set(-5.2, 0.33, -1.6);
    groupMachine.add(nic);
    const lNet = makeLabel('NET', 'pcb-tag', 'm-net');
    lNet.position.set(-5.2, 0.8, -1.6);
    groupMachine.add(lNet);

    // ============ 屏幕（后侧立起） ============
    const scrStand = makeBox(0.5, 1.6, 0.5, MAT.metalDark);
    scrStand.position.set(0, 1.0, -4.2);
    groupMachine.add(scrStand);
    const screen = makeBox(5.6, 3.2, 0.12, MAT.cold, 'm-screen');
    screen.position.set(0, 3.2, -4.0);
    groupMachine.add(screen);
    const lScreen = makeLabel('SCREEN', 'pcb-tag', 'm-screen');
    lScreen.position.set(0, 5.0, -4.0);
    groupMachine.add(lScreen);

    // 主板标题（丝印风格）
    const lBoard = makeLabel('MOTHERBOARD · 点击部件逐层深入', 'layer-tag cold');
    lBoard.position.set(0, 0.55, 5.4);
    groupMachine.add(lBoard);
  }

  /* ================================================================
     内核层
     ================================================================ */
  const kernelSubs = [
    // 行1（前排，面向用户）：调度/内存/文件/网络 四大核心
    { id: 'k-sched', name: 'SCHED', pos: [-3.5, 2.62, 1.3],  mat: MAT.amber },
    { id: 'k-mm',    name: 'MM',    pos: [-1.17, 2.62, 1.3], mat: MAT.amber },
    { id: 'k-vfs',   name: 'VFS',   pos: [1.17, 2.62, 1.3],  mat: MAT.amber },
    { id: 'k-net',   name: 'NET',   pos: [3.5, 2.62, 1.3],   mat: MAT.amber },
    // 行2（中排）：中断/页缓存/ext4/块层 —— 文件数据流链路
    { id: 'k-irq',       name: 'IRQ',     pos: [-3.5, 2.62, 0],   mat: MAT.amberDeep },
    { id: 'k-pagecache', name: 'PCACHE',  pos: [-1.17, 2.62, 0],  mat: MAT.amberDeep },
    { id: 'k-ext4',      name: 'EXT4',    pos: [1.17, 2.62, 0],   mat: MAT.amberDeep },
    { id: 'k-block',     name: 'BLOCK',   pos: [3.5, 2.62, 0],    mat: MAT.amberDeep },
    // 行3（后排）：IPC/凭据/驱动/启动
    { id: 'k-ipc',      name: 'IPC',  pos: [-3.5, 2.62, -1.3], mat: MAT.amberDark },
    { id: 'k-cred',     name: 'CRED', pos: [-1.17, 2.62, -1.3],mat: MAT.amberDark },
    { id: 'k-drivers',  name: 'DRV',  pos: [1.17, 2.62, -1.3], mat: MAT.amberDark },
    { id: 'k-init',     name: 'INIT', pos: [3.5, 2.62, -1.3],  mat: MAT.amberDark },
  ];

  function buildKernel() {
    // 内核外壳（内核态边界）
    const shell = makeBox(10.4, 2.4, 6.0, MAT.glass);
    shell.position.set(0, 2.62, 0);
    groupKernel.add(shell);
    groupKernel.add(makeEdges(shell, 0x8a6a42));

    // 子系统模块
    kernelSubs.forEach(s => {
      const box = makeBox(1.5, 0.9, 1.3, s.mat, s.id);
      box.position.set(s.pos[0], s.pos[1], s.pos[2]);
      groupKernel.add(box);
      groupKernel.add(makeEdges(box, 0x5a3d20));
      const lb = makeLabel(s.name, null, s.id);
      lb.position.set(s.pos[0], s.pos[1] + 0.85, s.pos[2]);
      groupKernel.add(lb);
    });

    // 系统调用层：内核顶面一圈"闸门"
    const gatePositions = [
      [-3.6, 3.9, 1.8], [-1.2, 3.9, 1.8], [1.2, 3.9, 1.8], [3.6, 3.9, 1.8],
      [-3.6, 3.9, -1.8], [-1.2, 3.9, -1.8], [1.2, 3.9, -1.8], [3.6, 3.9, -1.8],
    ];
    gatePositions.forEach(p => {
      const gate = makeBox(0.55, 0.18, 0.55, MAT.amberDark, 'sc-overview');
      gate.position.set(p[0], p[1], p[2]);
      groupKernel.add(gate);
    });

    const lSyscall = makeLabel('SYSCALL · 系统调用', null, 'sc-overview');
    lSyscall.position.set(0, 4.35, 0);
    groupKernel.add(lSyscall);

    // read() 实例：数据流动画入口
    const readBox = makeBox(0.9, 0.22, 0.9, MAT.amberDeep, 'sc-read');
    readBox.position.set(0, 4.02, 2.3);
    groupKernel.add(readBox);
    const lRead = makeLabel('READ 实例', null, 'sc-read');
    lRead.position.set(0, 4.35, 2.3);
    groupKernel.add(lRead);

    // 层标签
    const lK = makeLabel('KERNEL · 内核态', 'layer-tag amber');
    lK.position.set(0, 2.6, 4.3);
    groupKernel.add(lK);
  }

  /* ================================================================
     用户层
     ================================================================ */
  const userProcs = [
    // 前排：日常程序
    { id: 'proc-model', name: 'bash',   pos: [-2.5, 6.15, 1.5], mat: MAT.cold,     w: 0.95, h: 1.5, d: 0.95 },
    { id: 'proc-fork',  name: 'vim',    pos: [0.0, 6.15, 1.6],  mat: MAT.cold,     w: 0.8,  h: 1.3, d: 0.8 },
    { id: 'proc-exec',  name: 'nginx',  pos: [2.5, 6.15, 1.5],  mat: MAT.coldDeep, w: 1.0,  h: 1.4, d: 1.0 },
    // 后排：服务与工具
    { id: 'proc-life',  name: 'sshd',   pos: [-2.5, 6.15, -1.5], mat: MAT.coldDeep, w: 0.9,  h: 1.45, d: 0.9 },
    { id: 'proc-ctx',   name: 'gcc',    pos: [0.0, 6.15, -1.6], mat: MAT.cold,     w: 0.85, h: 1.35, d: 0.85 },
    { id: 'proc-addr',  name: 'chrome', pos: [2.5, 6.15, -1.5], mat: MAT.cold,     w: 1.05, h: 1.6, d: 1.05 },
  ];

  function buildUser() {
    // 用户态圆盘
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(4.6, 4.6, 0.12, 64),
      MAT.glassCold
    );
    disc.position.set(0, 5.15, 0);
    disc.receiveShadow = true;
    groupUser.add(disc);

    // libc：进程与系统调用之间的"翻译层"（圆盘中央）
    const libc = makeBox(1.5, 0.7, 1.5, MAT.coldDark, 'k-libc');
    libc.position.set(0, 5.55, 0);
    groupUser.add(libc);
    groupUser.add(makeEdges(libc, 0x496071));
    const lLibc = makeLabel('LIBC', null, 'k-libc');
    lLibc.position.set(0, 6.05, 0);
    groupUser.add(lLibc);

    // 进程（外壳 + 内部段）
    userProcs.forEach(p => {
      const outer = new THREE.Mesh(
        new THREE.BoxGeometry(p.w, p.h, p.d),
        new THREE.MeshStandardMaterial({ color: 0x8aa8bd, transparent: true, opacity: 0.22, metalness: 0.1, roughness: 0.4 })
      );
      outer.position.set(p.pos[0], p.pos[1], p.pos[2]);
      outer.castShadow = true;
      outer.userData.nodeId = p.id;
      outer.userData.baseEmissive = 0x000000;
      groupUser.add(outer);
      groupUser.add(makeEdges(outer, 0x5c7484));

      // 内部：text/data/stack 示意条
      const innerH = p.h * 0.52;
      const iw = p.w * 0.55;
      const barT = makeBox(iw, innerH * 0.32, p.d * 0.5, MAT.coldDark);
      barT.position.set(p.pos[0], p.pos[1] + innerH * 0.3, p.pos[2]);
      groupUser.add(barT);
      const barD = makeBox(iw, innerH * 0.2, p.d * 0.5, MAT.coldDeep);
      barD.position.set(p.pos[0], p.pos[1] - 0.05, p.pos[2]);
      groupUser.add(barD);
      const barS = makeBox(iw, innerH * 0.28, p.d * 0.5, MAT.coldDark);
      barS.position.set(p.pos[0], p.pos[1] - innerH * 0.34, p.pos[2]);
      groupUser.add(barS);

      // 标签
      const lb = makeLabel(p.name, null, p.id);
      lb.position.set(p.pos[0], p.pos[1] + p.h / 2 + 0.45, p.pos[2]);
      groupUser.add(lb);
    });

    // 系统调用连线：进程 → libc → 内核顶面
    const gateY = 3.99;
    const libcPos = new THREE.Vector3(0, 5.5, 0);
    const gatePos = new THREE.Vector3(0, gateY, 0);
    // libc → 系统调用门
    groupUser.add(makeLine([libcPos, gatePos], LINE_COLORS.amber, 0.4));
    // 进程 → libc
    userProcs.forEach(p => {
      const pPos = new THREE.Vector3(p.pos[0], p.pos[1] - p.h / 2, p.pos[2]);
      groupUser.add(makeLine([pPos, libcPos], LINE_COLORS.cold, 0.35));
    });

    // 层标签
    const lU = makeLabel('USER · 用户态', 'layer-tag cold');
    lU.position.set(0, 7.1, 0);
    groupUser.add(lU);
  }

  /* ================================================================
     目录树
     ================================================================ */
  const fsNodes = [
    { id: 'fs-root',  name: '/',       pos: [-8.6, 1.0, 0],  r: 0.62, mat: MAT.amber },
    { id: 'fs-bin',   name: '/bin',    pos: [-10.6, 2.5, -0.6], r: 0.4, mat: MAT.amberDeep },
    { id: 'fs-etc',   name: '/etc',    pos: [-9.2, 2.5, 1.5],   r: 0.4, mat: MAT.amberDeep },
    { id: 'fs-home',  name: '/home',   pos: [-7.2, 2.5, 1.4],   r: 0.4, mat: MAT.amberDeep },
    { id: 'fs-usr',   name: '/usr',    pos: [-6.4, 2.5, -0.8],  r: 0.42, mat: MAT.amberDeep },
    { id: 'fs-var',   name: '/var',    pos: [-9.0, 2.5, -2.0],  r: 0.38, mat: MAT.amberDark },
    { id: 'fs-dev',   name: '/dev',    pos: [-10.4, 4.0, 0.9],  r: 0.36, mat: MAT.amberDark },
    { id: 'fs-proc',  name: '/proc',   pos: [-8.2, 4.0, 1.9],   r: 0.36, mat: MAT.amberDark },
    { id: 'fs-sys',   name: '/sys',    pos: [-6.6, 4.0, 1.4],   r: 0.36, mat: MAT.amberDark },
    { id: 'fs-tmp',   name: '/tmp',    pos: [-6.2, 4.0, -0.9],  r: 0.34, mat: MAT.amberDark },
    { id: 'fs-lib',   name: '/lib',    pos: [-8.4, 4.0, -1.6],  r: 0.36, mat: MAT.amberDark },
    { id: 'fs-boot',  name: '/boot',   pos: [-9.9, 5.4, 0.1],   r: 0.34, mat: MAT.amberDark },
    { id: 'fs-root2', name: '/root',   pos: [-7.3, 5.4, 1.2],   r: 0.32, mat: MAT.amberDark },
  ];

  function buildFS() {
    fsNodes.forEach(n => {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(n.r, 24, 18), n.mat);
      sphere.position.set(n.pos[0], n.pos[1], n.pos[2]);
      sphere.castShadow = true;
      sphere.userData.nodeId = n.id;
      sphere.userData.baseEmissive = 0x000000;
      groupFS.add(sphere);

      const lb = makeLabel(n.name, null, n.id);
      lb.position.set(n.pos[0], n.pos[1] + n.r + 0.5, n.pos[2]);
      groupFS.add(lb);
    });

    // 树形连线
    const root = fsNodes[0];
    const children = fsNodes.slice(1);
    const parentMap = {
      'fs-bin': 'fs-root', 'fs-etc': 'fs-root', 'fs-home': 'fs-root',
      'fs-usr': 'fs-root', 'fs-var': 'fs-root',
      'fs-dev': 'fs-etc', 'fs-proc': 'fs-etc', 'fs-sys': 'fs-home',
      'fs-tmp': 'fs-usr', 'fs-lib': 'fs-usr',
      'fs-boot': 'fs-usr', 'fs-root2': 'fs-home',
    };
    children.forEach(c => {
      const par = fsNodes.find(x => x.id === parentMap[c.id]);
      if (!par) return;
      const pts = [
        new THREE.Vector3(par.pos[0], par.pos[1] + par.r, par.pos[2]),
        new THREE.Vector3(c.pos[0], c.pos[1] - c.r, c.pos[2]),
      ];
      groupFS.add(makeLine(pts, LINE_COLORS.amber, 0.4));
    });
    void root;

    const lFS = makeLabel('FILESYSTEM · 目录树', 'layer-tag');
    lFS.position.set(-8.6, 0.3, 2.6);
    groupFS.add(lFS);
  }

  /* ================================================================
     内存视图（虚拟内存 / 页表 / 物理内存）
     ================================================================ */
  function buildMem() {
    const gx = 8.2;

    // ---- 进程虚拟地址空间柱（proc-addr）----
    const segSpec = [
      { h: 0.9,  mat: MAT.term,    label: 'text 代码' },       // 底部
      { h: 0.6,  mat: MAT.coldDeep,label: 'data 数据' },
      { h: 1.7,  mat: MAT.cold,    label: 'heap 堆 ↑' },
      { h: 0.9,  mat: MAT.coldDark,label: 'mmap 共享库 ↓' },
      { h: 1.5,  mat: MAT.cold,    label: 'stack 栈 ↓' },      // 顶部
    ];
    const segW = 1.7, segD = 1.7;
    let yAcc = 0.9;
    const addrRoot = new THREE.Group();
    segSpec.forEach(seg => {
      const box = makeBox(segW, seg.h, segD, seg.mat, 'proc-addr');
      box.position.set(0, yAcc + seg.h / 2, 0);
      yAcc += seg.h;
      addrRoot.add(box);
    });
    addrRoot.position.set(gx - 2.6, 0, 0);
    groupMem.add(addrRoot);

    const lAddr = makeLabel('虚拟地址空间', null, 'proc-addr');
    lAddr.position.set(gx - 2.6, yAcc + 0.5, 0);
    groupMem.add(lAddr);

    // ---- 页表（mem-page）----
    const ptGroup = new THREE.Group();
    const ptW = 3.2, ptH = 2.4;
    const ptFrame = new THREE.Mesh(
      new THREE.PlaneGeometry(ptW, ptH),
      new THREE.MeshBasicMaterial({ color: 0x1c2320, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    ptGroup.add(ptFrame);
    const ptWire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.PlaneGeometry(ptW, ptH)),
      new THREE.LineBasicMaterial({ color: 0x8a6a42, transparent: true, opacity: 0.35 })
    );
    ptGroup.add(ptWire);

    // 页表里的"映射项"（部分高亮小格，可点击）
    const litPositions = [
      [-1.2, 0.7], [-0.4, 0.3], [0.5, -0.2], [1.1, 0.8], [-0.8, -0.6],
      [0.3, 0.9], [1.2, -0.7], [-0.2, -0.9], [0.9, 0.1], [-1.3, -0.3],
    ];
    litPositions.forEach((p, i) => {
      const cell = makeBox(0.34, 0.34, 0.12, MAT.amberDeep, 'mem-page');
      cell.position.set(p[0], p[1], 0);
      ptGroup.add(cell);
    });
    ptGroup.position.set(gx, 3.4, 0);
    groupMem.add(ptGroup);

    const lPt = makeLabel('页表 PTE', null, 'mem-page');
    lPt.position.set(gx, 5.0, 0);
    groupMem.add(lPt);

    // ---- 物理页框（mem-virt）----
    const framePositions = [];
    for (let i = 0; i < 12; i++) {
      const fx = (i - 5.5) * 0.62;
      framePositions.push(fx);
      const mat = (i % 3 === 0) ? MAT.term : MAT.metalDark;
      const box = makeBox(0.5, 0.32, 0.5, mat, 'mem-virt');
      box.position.set(fx, 0.55, 0);
      groupMem.add(box);
    }

    const lFrames = makeLabel('物理内存页框', null, 'mem-virt');
    lFrames.position.set(gx, 1.15, 0);
    groupMem.add(lFrames);

    // ---- 映射连线：页表点亮格 ↔ 物理页框 ----
    litPositions.forEach((p, i) => {
      const targetX = framePositions[(i * 3) % 12];
      const pts = [
        new THREE.Vector3(gx + p[0], 3.4 + p[1] - 0.2, 0),
        new THREE.Vector3(gx + (p[0] + targetX) / 2, 2.1, 0),
        new THREE.Vector3(gx + targetX, 0.85, 0),
      ];
      groupMem.add(makeLine(pts, LINE_COLORS.amber, 0.28));
    });

    // ---- 缺页箭头（装饰，指向页表）----
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.55, 12),
      new THREE.MeshBasicMaterial({ color: 0xe9bc82, transparent: true, opacity: 0.85 })
    );
    arrow.position.set(gx - 2.6, 1.4, 0);
    arrow.rotation.z = -Math.PI / 2;
    arrow.userData.pulse = true;
    groupMem.add(arrow);

    const lFault = makeLabel('PAGE FAULT 缺页', null, 'mem-fault');
    lFault.position.set(gx - 3.9, 2.2, 0);
    groupMem.add(lFault);

    const lMemTag = makeLabel('MEMORY · 内存管理', 'layer-tag amber');
    lMemTag.position.set(gx, 0.3, 2.4);
    groupMem.add(lMemTag);
  }

  /* ================================================================
     构建
     ================================================================ */
  buildHardware();
  buildMachine();
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
    machine:  { pos: [0, 4.8, 11.5], look: [0, 1.6, 0], show: { machine: true } },
  };

  const VIEW_NAMES = { machine: '整机', panorama: '全景', kernel: '内核态', fs: '目录树', process: '进程', memory: '内存', user: '用户' };

  function applyViewShow(v) {
    const d = VIEW_DEFS[v];
    groupHardware.visible = !!d.show.hw;
    groupKernel.visible = !!d.show.kernel;
    groupUser.visible = !!d.show.user;
    groupFS.visible = !!d.show.fs;
    groupMem.visible = !!d.show.mem;
    groupMachine.visible = !!d.show.machine;
  }

  /* ---------------- 相机动画 ---------------- */

  function flyTo(targetPos, targetLook, dur) {
    camAnim = {
      t: 0, dur: dur || 900,
      fromPos: camera.position.clone(),
      toPos: new THREE.Vector3(...targetPos),
      fromLook: controls.target.clone(),
      toLook: new THREE.Vector3(...targetLook),
    };
  }

  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function setView(v) {
    if (!VIEW_DEFS[v]) return;
    currentView = v;
    applyViewShow(v);
    UI.setViewName(VIEW_NAMES[v]);
    const d = VIEW_DEFS[v];
    flyTo(d.pos, d.look);
    document.querySelectorAll('.view-btn').forEach(b =>
      b.classList.toggle('active', b.getAttribute('data-view') === v));
    try { history.replaceState(null, '', '#view=' + v); } catch (e) {}
  }

  function focusNode(nodeId) {
    const obj = findMeshByNode(nodeId);
    if (!obj) return;
    const world = new THREE.Vector3();
    obj.getWorldPosition(world);
    const dist = world.distanceTo(camera.position);
    const targetPos = world.clone().add(new THREE.Vector3(0, 0.6, Math.max(3.4, dist * 0.35)));
    // 保持与对象的相对方向：简单从当前方向后退
    const dir = world.clone().sub(camera.position).normalize();
    const camPos = world.clone().add(dir.multiplyScalar(-3.6)).add(new THREE.Vector3(0, 0.9, 0));
    flyTo([camPos.x, camPos.y, camPos.z], [world.x, world.y + 0.2, world.z], 700);
    selectNode(obj);
    UI.setStatus(window.KDATA.nodes[nodeId] ? window.KDATA.nodes[nodeId].name : nodeId);
  }

  /* ---------------- 选中 / hover ---------------- */

  function selectNode(obj) {
    clearSelection();
    if (!obj) return;
    selected = obj;
    const mat = obj.material;
    if (mat && mat.emissive) {
      mat.emissive.setHex(0x3a2c18);
      mat.emissiveIntensity = 0.9;
    }
    // 高亮轮廓
    const edges = new THREE.EdgesGeometry(obj.geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xe9bc82, transparent: true, opacity: 0.9 }));
    line.position.copy(obj.position);
    line.rotation.copy(obj.rotation);
    obj.parent.add(line);
    selectedOutline = line;

    // 绘制关系连线（连接相关模块）
    if (obj.userData && obj.userData.nodeId) {
      drawRelations(obj.userData.nodeId);
    }
  }

  function clearSelection() {
    if (selected && selected.material && selected.material.emissive) {
      selected.material.emissive.setHex(0x000000);
    }
    if (selectedOutline) {
      selectedOutline.parent && selectedOutline.parent.remove(selectedOutline);
      selectedOutline = null;
    }
    clearRelations();
    selected = null;
  }

  /* ---------------- 关系连线 ---------------- */
  const relationGroup = new THREE.Group();
  scene.add(relationGroup);
  const dimmedStates = new Map();   // mesh -> {opacity, transparent}

  // 分层归属：同层关系用琥珀实线，跨层关系用冷蓝虚线
  const LAYER = { kernel: 'k', syscall: 'k', proc: 'u', user: 'u', mem: 'm', fs: 'f', hw: 'h' };

  function clearRelations() {
    while (relationGroup.children.length) {
      relationGroup.remove(relationGroup.children[0]);
    }
    stopFlow();
    dimmedStates.forEach((state, mesh) => {
      if (mesh.material) {
        mesh.material.opacity = state.opacity;
        mesh.material.transparent = state.transparent;
      }
    });
    dimmedStates.clear();
    scene.traverse(o => {
      if (o.userData && o.userData.relationGlow) {
        o.userData.relationGlow = false;
        if (o.material && o.material.emissive) {
          o.material.emissive.setHex(o.userData.baseEmissive || 0x000000);
        }
      }
    });
  }

  /* ---------------- 数据流动画 ---------------- */
  const flowGroup = new THREE.Group();
  scene.add(flowGroup);
  let flowState = null;

  function startFlow(nodeId) {
    stopFlow();
    const node = window.KDATA.nodes[nodeId];
    if (!node || !node.path || !node.path.length) return;
    // 收集路径点（世界坐标）
    const pts = [];
    for (const pid of node.path) {
      const mesh = findMeshByNode(pid);
      if (!mesh) return;
      const v = new THREE.Vector3();
      mesh.getWorldPosition(v);
      pts.push(v);
    }
    if (pts.length < 2) return;

    // 轨迹虚线
    const trailGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const trail = new THREE.Line(trailGeo, new THREE.LineDashedMaterial({
      color: 0xe9bc82, transparent: true, opacity: 0.55, dashSize: 0.2, gapSize: 0.16,
    }));
    trail.computeLineDistances();
    flowGroup.add(trail);

    // 光点（4 个，沿路径循环流动）
    const dots = [];
    for (let i = 0; i < 4; i++) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 12, 12),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xe9bc82 : 0x9cc39a, transparent: true, opacity: 0.95 })
      );
      flowGroup.add(dot);
      dots.push(dot);
    }

    // 各段长度
    const segLens = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const l = pts[i].distanceTo(pts[i + 1]);
      segLens.push(l);
      total += l;
    }
    flowState = { pts, segLens, total, dots, t: 0 };
  }

  function updateFlow(dt) {
    if (!flowState) return;
    flowState.t += dt * 2.4;   // 速度：总长 / 2.4s 一圈
    const { pts, segLens, total, dots } = flowState;
    const L = total || 1;
    for (let i = 0; i < dots.length; i++) {
      let d = (flowState.t + (i * L) / dots.length) % L;
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
      dots[i].position.copy(pos);
    }
  }

  function stopFlow() {
    while (flowGroup.children.length) flowGroup.remove(flowGroup.children[0]);
    flowState = null;
  }

  function drawRelations(nodeId) {
    clearRelations();
    const node = window.KDATA.nodes[nodeId];
    if (!node || !node.related || !node.related.length) return;
    const src = findMeshByNode(nodeId);
    if (!src) return;
    const srcPos = new THREE.Vector3();
    src.getWorldPosition(srcPos);

    node.related.forEach(rid => {
      const rn = window.KDATA.nodes[rid];
      const target = findMeshByNode(rid);
      if (!target || !rn) return;
      const tPos = new THREE.Vector3();
      target.getWorldPosition(tPos);

      // 连线：同层琥珀实线 / 跨层冷蓝虚线
      const same = LAYER[node.type] === LAYER[rn.type];
      const mat = same
        ? new THREE.LineBasicMaterial({ color: 0xd9a05b, transparent: true, opacity: 0.75 })
        : new THREE.LineDashedMaterial({ color: 0x8aa8bd, transparent: true, opacity: 0.8, dashSize: 0.16, gapSize: 0.12 });
      const geo = new THREE.BufferGeometry().setFromPoints([srcPos, tPos]);
      const line = new THREE.Line(geo, mat);
      if (!same) line.computeLineDistances();
      relationGroup.add(line);

      // 相关目标弱高亮
      target.userData.relationGlow = true;
      if (target.material && target.material.emissive) {
        target.material.emissive.setHex(0x2a1d0e);
      }

      // 无关对象淡化（保留选中、相关与内存视图装饰）
      scene.traverse(o => {
        if (!o.userData || !o.userData.nodeId) return;
        const id = o.userData.nodeId;
        if (id === nodeId || id === rid) return;
        if (id.startsWith('mem-')) return;
        if (!o.material || dimmedStates.has(o)) return;
        dimmedStates.set(o, { opacity: o.material.opacity, transparent: o.material.transparent });
        o.material.transparent = true;
        o.material.opacity = 0.22;
      });
    });

    // 数据流动画（如有 path）
    if (node.path && node.path.length) startFlow(nodeId);
  }

  function hoverNode(obj) {
    if (obj === hovered) return;
    if (hovered && hovered.material && hovered.material.emissive) {
      hovered.material.emissive.setHex(0x000000);
    }
    hovered = obj;
    if (obj && obj.material && obj.material.emissive) {
      obj.material.emissive.setHex(0x241a0e);
    }
    document.body.style.cursor = obj ? 'pointer' : 'default';
  }

  function pick(evt) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObjects(scene.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o) {
        if (o.userData && o.userData.nodeId) return o;
        o = o.parent;
      }
    }
    return null;
  }

  function findMeshByNode(nodeId) {
    let found = null;
    scene.traverse(o => {
      if (!found && o.userData && o.userData.nodeId === nodeId) found = o;
    });
    return found;
  }

  /* ---------------- 事件 ---------------- */

  renderer.domElement.addEventListener('pointerdown', (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (pointerDownPos) {
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (dx * dx + dy * dy < 36) {           // 视为点击
        const obj = pick(e);
        if (obj) {
          const id = obj.userData.nodeId;
          UI.renderPanel(id);
          selectNode(obj);
          UI.setStatus(K3D.nameOf(id));
        } else {
          UI.setStatus('—');
          clearSelection();
        }
      }
    }
    pointerDownPos = null;
  });

  renderer.domElement.addEventListener('pointermove', (e) => {
    const obj = pick(e);
    hoverNode(obj);
  });

  /* ---------------- 动画循环 ---------------- */

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    // 相机动画
    if (camAnim) {
      camAnim.t += dt * 1000;
      const k = Math.min(1, camAnim.t / camAnim.dur);
      const e = easeInOut(k);
      camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, e);
      controls.target.lerpVectors(camAnim.fromLook, camAnim.toLook, e);
      if (k >= 1) camAnim = null;
    }

    // 脉冲元素
    scene.traverse(o => {
      if (o.userData && o.userData.pulse && o.material) {
        o.material.opacity = 0.5 + 0.35 * Math.sin(clock.elapsedTime * 3.2);
      }
    });

    controls.update();
    updateFlow(dt);
    renderer.render(scene, camera);
    cssRenderer.render(scene, camera);
  }
  animate();

  /* ---------------- 窗口自适应 ---------------- */

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---------------- 对外接口 ---------------- */

  /* 钻取：整机部件 → 对应子系统视图，并记录面包屑 */
  function drill(id) {
    const n = window.KDATA.nodes[id];
    if (!n || !n.drill) return;
    window.__K3D_CRUMB = '整机 › ' + n.name;
    setView(n.drill.view);
    if (n.drill.focus) {
      setTimeout(function () { focusNode(n.drill.focus); }, 1000);
    }
  }

  const K3D = {
    setView, focusNode, selectNode, clearSelection, drill,
    nameOf: (id) => (window.KDATA.nodes[id] ? window.KDATA.nodes[id].name : '—'),
    onSceneContextMenu: null,
    _dbg: { scene, camera, renderer, controls },
  };
  window.K3D = K3D;

  // 供 ui.js 使用：右键菜单在 ui.js 的 document contextmenu 里调用
  // 这里把场景 pick 暴露出去：ui.js 的 contextmenu 会先问我们
  K3D.onSceneContextMenu = (e) => {
    const obj = pick(e);
    UI.openCtx(e.clientX, e.clientY, obj ? obj.userData.nodeId : null);
    return true;
  };

  /* URL hash 深链：#view=内核态 / #view=memory 直达指定视图（可分享/收藏）。
     必须在 setView 之前读取——setView 内部会 replaceState 改写 hash */
  var initView = 'machine';
  (function () {
    var m = location.hash.match(/view=([a-z]+)/);
    if (m && VIEW_DEFS[m[1]]) initView = m[1];
  })();
  setView(initView);

  /* 渲染黑屏检测：渲染数帧后若画布几乎无内容，
     说明驱动/软渲染异常（renderer 创建成功≠画面正常），回退 CSS3D */
  let checked = false;
  function verifyRendered() {
    if (checked) return;
    let frames = 0;
    const t0 = performance.now();
    (function check() {
      frames++;
      if (frames < 8 && performance.now() - t0 < 5000) {
        requestAnimationFrame(check);
        return;
      }
      checked = true;
      try {
        const gl = renderer.getContext();
        const w = renderer.domElement.width, h = renderer.domElement.height;
        if (w === 0 || h === 0) { fallbackToCSS3D(); return; }
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let diff = 0, total = 0;
        for (let i = 0; i < px.length; i += 8) {
          const r = px[i], g = px[i + 1], b = px[i + 2];
          // 背景色 0x141a17 ≈ (20,26,23)
          if (Math.abs(r - 20) > 32 || Math.abs(g - 26) > 32 || Math.abs(b - 23) > 32) diff++;
          total++;
        }
        if (total === 0 || diff / total < 0.01) {
          fallbackToCSS3D();
        }
      } catch (e) {
        fallbackToCSS3D();
      }
    })();
  }
  verifyRendered();
  }

  /* boot：检测 WebGL，失败则延迟重试（软件渲染下 GPU 进程可能未就绪） */
  function boot() {
    if (!webglAvailable()) {
      glTries++;
      if (glTries <= 5) { setTimeout(boot, 400 * glTries); return; }
      fallbackToCSS3D();
      return;
    }
    startScene();
  }
  boot();
})();

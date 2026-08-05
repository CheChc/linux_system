# KERNEL://EXPLORER — Linux 内核三维学习器

一个以 3D 交互方式学习 Linux 系统架构的单页网站。把 Linux 的分层架构、目录树、
进程、内存、用户管理变成可旋转、可点击、可钻取的立体地图。

## 快速开始

方式一（最简单，推荐）：**双击 `Linux内核学习器.html`**（单文件版）
  所有代码内联在一个文件里，无需服务器、无需联网、无缓存问题，
  Windows / macOS 双击即用。

方式二（完整功能 + 光影效果，需要 WebGL）：
```
cd ~/Desktop/linux-kernel-3d
python3 -m http.server 8899
# 浏览器打开 http://localhost:8899
```
（Windows 可双击 start.bat，macOS 可双击 start.command 一键启动）

多文件源码版位于 js/ 与 css/，改完用 `python3 build_single.py` 重新生成单文件版。

## 操作方式

- 左键拖动 — 移动视角位置（平移）
- 中键拖动 — 旋转视角
- 滚轮 / 右键拖动 — 缩放
- 左键点击 3D 物体或标签 — 查看功能讲解（右侧信息面板）
- 点击模块后自动显示**关系连线**：琥珀实线=同层关系（内核↔内核），
  冷蓝虚线=跨层关系（内核↔用户/内存/目录）；相关模块高亮，其余淡化
- 点击空白处 — 清除选中与连线
- 右键点击物体 — 菜单：查看源码 / 设计思路 / 聚焦此对象
- 顶部视图切换：全景 / 内核态 / 目录树 / 进程 / 内存 / 用户
- ESC — 关闭面板 / 源码浮层

## 学习内容（46 个节点，全部含真实内核源码 + 设计思路）

| 模块 | 节点 |
|------|------|
| 硬件层 | CPU（特权级/MMU）、RAM（页框）、Disk（块设备） |
| 目录树 | / /bin /etc /home /usr /var /tmp /dev /proc /sys /lib /boot /root |
| 内核态 | start_kernel、调度器、内存管理、VFS、网络、驱动、IPC、凭据、中断、页缓存、ext4、块设备层 |
| 用户态库 | libc（glibc：系统调用封装层） |
| 系统调用 | 总览（syscall 全链路）、read() 实例 |
| 进程 | task_struct、fork、exec、生命周期、地址空间、上下文切换 |
| 内存 | 虚拟内存、页表、缺页、swap 回收、伙伴/slab 分配器 |
| 用户 | UID/GID、passwd/shadow、权限位、身份传递链 |

**架构布局**：内核层按功能簇排列（4×3 网格）——行1 四大核心（调度/内存/VFS/网络）、
行2 文件数据流链路（中断/页缓存/ext4/块层）、行3 支撑（IPC/凭据/驱动/启动）；
用户层 libc 居中、进程环绕；硬件层按数据流横排（CPU→RAM→Disk）。

**数据流动画**：点击带路径的节点（READ 实例、SYSCALL、缺页、start_kernel、exec），
光点会沿真实调用链路流动：
- READ 实例：bash → SYSCALL → VFS → ext4 → 页缓存 → 块层 → 磁盘
- 缺页：地址空间 → 页表 → 缺页 → 物理页框
- start_kernel：CPU → 启动 → 调度 → 内存 → VFS → 进程

源码片段取自真实 Linux 内核（kernel.org），路径真实可查：
`init/main.c`、`kernel/sched/core.c`、`mm/memory.c`、`fs/namei.c`、
`arch/x86/include/asm/pgtable_types.h`、`kernel/fork.c`、`fs/exec.c` 等。

## 技术栈

- Three.js r128（本地 UMD，无构建步骤）
- OrbitControls / CSS2DRenderer / CSS3DRenderer（本地）
- 原生 HTML/CSS/JS，无框架
- 设计语言：暗色工业风 — 暖黑底 + 琥珀（内核态）+ 冷蓝灰（用户态）+ 金属灰（硬件）

## 双渲染模式（自动切换，无需配置）

| 条件 | 模式 | 说明 |
|------|------|------|
| 浏览器支持 WebGL | 3D 光影版（js/main.js） | 完整材质、光照、阴影 |
| 无 WebGL（软件渲染/虚拟机/老硬件） | CSS3D 卡片版（js/main-css3d.js） | CSS transform 3D，无需 GPU，交互完全一致 |

页面加载时自动检测：`canvas.getContext('webgl2'/'webgl')` 可用则加载 3D 光影版，
否则加载 CSS3D 卡片版（层板 + 节点卡片，同样可拖动、点击、右键）。
WebGL 版内部还带 5 次延迟重试，避免 GPU 进程初始化慢导致误判。
另有文字版目录兜底：任何情况下点击引导框或 HUD 相关入口都能浏览全部 41 个节点的讲解与源码。

## 文件结构

```
linux-kernel-3d/
├─ index.html          页面骨架 + 渲染模式自动选择
├─ css/style.css       设计系统
└─ js/
   ├─ three.min.js     Three.js r128
   ├─ OrbitControls.js 轨道控制器
   ├─ CSS2DRenderer.js CSS 标签渲染
   ├─ CSS3DRenderer.js CSS3D 降级渲染（无 WebGL）
   ├─ data.js          内容数据①：目录/硬件/内核/系统调用
   ├─ data2.js         内容数据②：进程/内存/用户/凭据
   ├─ ui.js            面板/菜单/源码浮层/视图逻辑
   ├─ main.js          WebGL 版场景 + 交互 + 相机
   └─ main-css3d.js    CSS3D 版场景 + 交互 + 相机
```

## 定制内容

新增/修改讲解节点：编辑 `js/data.js` / `js/data2.js`，按现有节点格式
（id/name/kind/desc/source/idea/related）添加即可，3D 场景中对应物体的
`userData.nodeId` 指向该 id 即可关联。

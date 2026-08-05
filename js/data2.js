/* ==========================================================================
   KDATA — 内容数据（第二部分：进程 / 内存 / 用户管理）
   源码片段取自真实 Linux 内核（kernel.org）。
   ========================================================================== */

const N2 = window.KDATA.nodes;

N2['k-cred'] = {
  id: 'k-cred', type: 'kernel', name: 'cred / capability', en: '凭据与能力',
  kind: '内核 · 安全',
  zh: '进程"是谁"：内核用 cred 记录身份，用 capability 拆解 root 的权限。',
  desc: `
    <p>每次权限检查都要回答"这个进程是谁"。内核把答案存在 <code>struct cred</code>（凭据）里，随进程走：</p>
    <ul>
      <li><b>uid/euid/suid/fsuid</b> — 四重用户 ID（真实/有效/保存/文件系统）</li>
      <li><b>gid/egid/sgid/fsgid</b> — 四重组 ID</li>
      <li><b>capabilities</b> — 能力位图：进程被允许做哪些特权操作</li>
    </ul>
    <p>传统 Unix 只有"root / 非 root"二元判断，太粗糙。Linux 把 root 的特权拆成 <b>40+ 项能力</b>：</p>
    <ul>
      <li><code>CAP_NET_BIND_SERVICE</code> — 绑定 1024 以下特权端口</li>
      <li><code>CAP_SYS_ADMIN</code> — 挂载文件系统、管理设备</li>
      <li><code>CAP_DAC_OVERRIDE</code> — 绕过文件读写权限</li>
    </ul>
    <p>所以一个进程可以"只拥有绑定端口的能力，而没有改内核的能力"——容器（docker）正是靠裁剪 capability 实现隔离：容器内 root 其实只持有几个能力。</p>
    <p>凭据一旦建立就<b>不可变</b>：要改权限，内核会复制一份 cred 再修改（COW 思想在安全领域的应用），保证并发访问时身份不会"半新半旧"。</p>`,
  source: {
    file: 'kernel/cred.c',
    note: 'prepare_creds 复制一份新凭据，commit_creds 原子替换。',
    code: `/* kernel/cred.c —— 凭据的复制与提交（节选） */

struct cred *prepare_creds(void)
{
	struct task_struct *task = current;
	const struct cred *old;
	struct cred *new;

	...
	new = kmem_cache_alloc(cred_jar, GFP_KERNEL);
	...
	memcpy(new, old, sizeof(struct cred));   /* 复制旧凭据 */
	...
	return new;
}

int commit_creds(struct cred *new)
{
	struct task_struct *task = current;
	...
	/* 原子替换：旧凭据被换下，新凭据生效 */
	rcu_assign_pointer(task->real_cred, new);
	rcu_assign_pointer(task->cred, new);
	...
	return 0;
}

/* 典型使用：setuid() 时复制→改 euid→提交 */
SYSCALL_DEFINE1(setuid, uid_t, uid)
{
	...
	new = prepare_creds();
	new->euid = make_kuid(ns, uid);
	...
	return commit_creds(new);
}`
  },
  idea: `<p>凭据 COW + 原子提交，是"并发安全"的教科书做法：要么旧身份，要么新身份，绝无中间态。capability 则展示了"最小权限"的工程落地——root 不是神，是一堆可裁剪的能力。</p>`,
  related: ['user-uid', 'user-process', 'proc-model']
};

/* ==========================================================================
   五、进程
   ========================================================================== */

N2['proc-model'] = {
  id: 'proc-model', type: 'proc', name: 'process', en: '进程是什么',
  kind: '进程',
  zh: '进程 = 正在运行的程序 + 内核为它记的一本账（task_struct）。',
  desc: `
    <p>程序（躺在磁盘上的文件）和进程（跑在内存里的实例）是两回事。进程是<b>运行中的程序</b>，内核为每个进程维护一个 <b>PCB（进程控制块）</b>，在 Linux 里就是 <code>struct task_struct</code>。</p>
    <p>task_struct 是内核里最庞大的结构体之一，记录了一个进程的全部信息：</p>
    <ul>
      <li><b>pid / tgid</b> — 进程号 / 线程组号</li>
      <li><b>state</b> — 运行、睡眠、停止、僵尸…</li>
      <li><b>mm</b> — 指向内存描述符（地址空间）</li>
      <li><b>fs</b> — 根目录、当前目录、umask</li>
      <li><b>files</b> — 文件描述符表（fd 0/1/2…）</li>
      <li><b>cred</b> — 用户身份（uid/gid/capabilities）</li>
      <li><b>signal</b> — 信号处理相关</li>
      <li><b>sched_info</b> — 调度信息（vruntime、优先级）</li>
    </ul>
    <p>所有 task_struct 通过双向链表和哈希表组织起来，<code>ps</code>、<code>top</code> 读的就是这份数据（经 /proc）。</p>`,
  source: {
    file: 'include/linux/sched.h',
    note: 'task_struct 关键字段（节选）。它是 PCB 的实体。',
    code: `/* include/linux/sched.h —— task_struct（节选） */

struct task_struct {
	...
	volatile long			state;	/* 进程状态 */
	...
	void				*stack;	/* 内核栈 */
	...
	pid_t				pid;	/* 进程 ID */
	pid_t				tgid;	/* 线程组 ID（getpid() 返回它） */
	...
	struct mm_struct		*mm;	/* 内存描述符（地址空间） */
	struct mm_struct		*active_mm;
	...
	struct fs_struct		*fs;	/* 文件系统信息（cwd、root） */
	struct files_struct		*files;	/* 打开的文件表（fd） */
	...
	const struct cred __rcu		*cred;	/* 用户身份（uid/gid/能力） */
	...
	struct sched_entity		se;	/* 调度实体（CFS 用） */
	...
};`
  },
  idea: `<p>理解进程，先理解 task_struct：它把"一个运行中的程序"这个抽象概念，落实成一份内核数据结构。操作系统的所有调度、内存、文件、信号逻辑，都在围绕这份结构转。</p>`,
  related: ['proc-fork', 'k-sched', 'proc-addr']
};

N2['proc-fork'] = {
  id: 'proc-fork', type: 'proc', name: 'fork()', en: '创建进程',
  kind: '进程 · 创建',
  zh: '创建新进程的唯一方式：复制父进程。',
  desc: `
    <p>Linux 创建进程只有一条路：<b>fork()</b>（或其变体 vfork/clone）。fork 的结果是一个与父进程几乎一样的子进程。</p>
    <p>fork 的"复制"是精打细算的：</p>
    <ul>
      <li><b>复制 PCB</b>：子进程拿到一份 task_struct 拷贝，pid 不同。</li>
      <li><b>复制页表</b>：子进程的虚拟地址空间与父进程指向<b>同一批物理页</b>，全部标为<b>只读</b>。</li>
      <li><b>写时复制（CoW）</b>：谁先写某个页，谁就触发缺页，内核才真正复制那个页。所以 fork 很便宜，真正贵的是"写"。</li>
      <li><b>返回值不同</b>：父进程 fork() 返回子进程 pid，子进程 fork() 返回 0——程序靠这个分流。</li>
    </ul>
    <p>fork 之后通常紧跟 <code>execve()</code> 换掉程序镜像（经典 fork+exec 模式）。</p>`,
  source: {
    file: 'kernel/fork.c',
    note: '_do_fork → copy_process 是 fork 的核心路径。',
    code: `/* kernel/fork.c —— fork 系统调用（节选） */

SYSCALL_DEFINE0(fork)
{
	return _do_fork(SIGCHLD, 0, 0, NULL, NULL, 0);
}

long _do_fork(unsigned long clone_flags, ...)
{
	...
	p = copy_process(pid, flags, ...);   /* 复制 PCB、mm、files... */
	...
	wake_up_new_task(p);                 /* 把新进程放进就绪队列 */
	...
	return p->pid;                       /* 父进程拿到子进程 pid */
}

static struct task_struct *copy_process(...)
{
	...
	p = dup_task_struct(current, node);   /* 拷贝 task_struct + 内核栈 */
	...
	retval = copy_mm(flags, p);           /* 复制地址空间（CoW 准备） */
	retval = copy_files(flags, p);        /* 复制文件描述符表 */
	retval = copy_signal(flags, p);
	...
}

/* 用户态经典用法 */
pid_t pid = fork();
if (pid == 0) {
	/* 子进程 */
	execve("/bin/ls", argv, envp);   /* 换镜像 */
} else {
	/* 父进程 */
	waitpid(pid, NULL, 0);           /* 等子进程结束 */
}`
  },
  idea: `<p>写时复制是"延迟支付"思想的典范：fork 时只抄目录（页表）、不抄内容（物理页），等到真有人写才补课。这让"创建进程"从昂贵的深拷贝变成近乎 O(1) 的轻操作。</p>`,
  related: ['proc-exec', 'proc-addr', 'mem-page']
};

N2['proc-exec'] = {
  id: 'proc-exec', type: 'proc', name: 'execve()', en: '换程序镜像',
  kind: '进程 · 执行',
  zh: '把当前进程的"身体"换成另一个程序。',
  desc: `
    <p><code>execve()</code> 不创建新进程——它把<b>当前进程</b>的地址空间整个清空，载入一个新程序，从新程序的入口开始跑。pid 不变，身份不变，但代码和数据全换了。</p>
    <p>内核里 exec 的步骤（<code>do_execveat_common</code>）：</p>
    <ul>
      <li>解析可执行文件（检查 ELF 魔数 <code>\\x7fELF</code>），找到对应的 <b>binfmt</b> 处理器。</li>
      <li>把 ELF 的代码段、数据段映射进地址空间（只读代码段 + 可写数据段）。</li>
      <li>为新程序重新布置用户栈（argv、envp 压栈），清空旧的堆。</li>
      <li>从 ELF 头指定的入口开始执行（动态链接则先进 ld.so）。</li>
    </ul>
    <p>所以 shell 里敲 <code>ls</code> 的完整真相：shell fork 一个子进程 → 子进程 execve("/bin/ls") → 跑 ls → 退出 → shell 的 waitpid 返回。</p>`,
  source: {
    file: 'fs/exec.c',
    note: 'execve 系统调用入口与 binfmt 分发。',
    code: `/* fs/exec.c —— execve（节选） */

SYSCALL_DEFINE3(execve,
		const char __user *, filename,
		const char __user *const __user *, argv,
		const char __user *const __user *, envp)
{
	return do_execve(getname(filename), argv, envp);
}

/* 加载 ELF 的处理器（fs/binfmt_elf.c 的核心函数） */
static int load_elf_binary(struct linux_binprm *bprm)
{
	...
	/* 映射代码段、数据段 */
	elf_map(bprm->file, load_bias + vaddr, &elf_ex, ...);
	...
	/* 布置用户栈（argv/envp 拷入） */
	retval = setup_arg_pages(bprm, randomize_stack_top(STACK_TOP), ...);
	...
	/* 跳到程序入口（动态链接则跳到 ld.so） */
	regs->ip = elf_entry;
	...
}`
  },
  idea: `<p>fork + exec 的分工很美：fork 管"再生"，exec 管"变身"。二者分离让 shell 可以在 exec 前自由改装子进程（重定向、设环境变量、改权限），这就是 Unix 进程模型的灵活性来源。</p>`,
  related: ['proc-fork', 'fs-usr', 'proc-addr']
};

N2['proc-life'] = {
  id: 'proc-life', type: 'proc', name: 'life cycle', en: '生命周期与状态',
  kind: '进程 · 状态',
  zh: '进程的一生：就绪 → 运行 → 睡眠 → 僵尸 → 消亡。',
  desc: `
    <p>进程状态由 <code>task_struct.state</code> 表示，<code>ps</code> 命令里看到的 <code>R/S/D/Z</code> 就是它：</p>
    <table class="mini-table">
      <tr><th>状态</th><th>含义</th><th>ps 显示</th></tr>
      <tr><td>TASK_RUNNING</td><td>正在运行或就绪排队</td><td>R</td></tr>
      <tr><td>TASK_INTERRUPTIBLE</td><td>可中断睡眠（等 I/O、等信号）</td><td>S</td></tr>
      <tr><td>TASK_UNINTERRUPTIBLE</td><td>不可中断睡眠（等磁盘 I/O，不可被信号打断）</td><td>D</td></tr>
      <tr><td>TASK_STOPPED</td><td>被暂停（Ctrl+Z / SIGSTOP）</td><td>T</td></tr>
      <tr><td>EXIT_ZOMBIE</td><td>已退出，等父进程收尸（wait）</td><td>Z</td></tr>
    </table>
    <p><b>僵尸进程</b>是初学者最困惑的概念：子进程 exit 后，内核保留它的 task_struct 等父进程 <code>wait()</code> 取退出码。此时它不占 CPU、不占内存（只剩 PCB），但占一个 pid 表项。父进程不 wait 也不退出，僵尸就会堆积。</p>
    <p>孤儿进程（父先退出）会被 <b>PID 1（systemd/init）</b>收养并自动回收。</p>`,
  source: {
    file: 'include/linux/sched.h',
    note: '进程状态的宏定义。state 字段就是这些值的位组合。',
    code: `/* include/linux/sched.h —— 进程状态定义（节选） */

/* Used in tsk->state: */
#define TASK_RUNNING			0x00000000
#define TASK_INTERRUPTIBLE		0x00000001
#define TASK_UNINTERRUPTIBLE		0x00000002
#define TASK_STOPPED			0x00000004
#define TASK_TRACED			0x00000008
/* Used in tsk->exit_state: */
#define EXIT_DEAD			0x00000010
#define EXIT_ZOMBIE			0x00000020

#define TASK_STATE_MAX			0x00000040

/* 用户态体验：ps -o pid,stat,cmd */
# PID  STAT CMD
# 123  S    sshd: /usr/sbin/sshd -D
# 456  R+   ps -o pid,stat,cmd
# 789  Z    [chrome] <defunct>        ← 僵尸！`
  },
  idea: `<p>状态机是进程管理的骨架：调度器只碰 RUNNING，等待队列只碰睡眠态，退出码必须有人接收。理解"僵尸要由父进程收尸"这一条，就能解释很多系统异常（pid 耗尽、defunct 进程）。</p>`,
  related: ['proc-model', 'k-sched', 'proc-fork']
};

N2['proc-addr'] = {
  id: 'proc-addr', type: 'proc', name: 'address space', en: '进程地址空间',
  kind: '进程 · 内存',
  zh: '每个进程都以为自己独占整个内存：虚拟地址空间的布局。',
  desc: `
    <p>在 x86-64 上，每个进程拥有 <b>128TB 虚拟地址空间</b>（低半区），布局自下而上：</p>
    <table class="mini-table">
      <tr><th>区域</th><th>内容</th></tr>
      <tr><td>0x0000...0000</td><td>空指针保护区（访问即段错误）</td></tr>
      <tr><td>text（代码段）</td><td>程序指令，只读可执行（r-x）</td></tr>
      <tr><td>data（数据段）</td><td>已初始化全局变量（rw-）</td></tr>
      <tr><td>bss</td><td>未初始化全局变量（rw-，不占磁盘）</td></tr>
      <tr><td>heap（堆）</td><td>malloc 向上增长</td></tr>
      <tr><td>mmap 区</td><td>共享库、mmap 文件（向下增长）</td></tr>
      <tr><td>stack（栈）</td><td>局部变量、函数调用，向下增长</td></tr>
      <tr><td>0x7fff...ffff</td><td>内核区（高半区，用户不可见）</td></tr>
    </table>
    <p>这个布局记录在 <code>struct mm_struct</code> 里，每个区域（text/data/heap/stack）是一个 <b>VMA（虚拟内存区）</b>，由红黑树 + 链表管理。malloc 的本质：在 mm_struct 里增加/扩展一个 VMA（不分配物理页），真正用到的页靠缺页补上。</p>`,
  source: {
    file: 'include/linux/mm_types.h',
    note: 'mm_struct 记录地址空间的边界。start_brk/brk 是堆的边界。',
    code: `/* include/linux/mm_types.h —— mm_struct（节选） */

struct mm_struct {
	...
	unsigned long start_code, end_code, start_data, end_data;
	unsigned long start_brk, brk, start_stack;
	unsigned long arg_start, arg_end, env_start, env_end;
	...
	struct vm_area_struct *mmap;      /* VMA 链表头 */
	struct rb_root mm_rb;             /* VMA 红黑树（快速查找） */
	...
	pgd_t *pgd;                       /* 页表基址（写进 CR3 的就是它） */
	...
};

/* 查看真实布局：cat /proc/self/maps */
# 55f3c0000000-55f3c0020000 r-xp  代码段（只读可执行）
# 55f3c0120000-55f3c0121000 rw-p  数据段
# 7f5a60000000-7f5a60001000 rw-p  堆
# 7f5a7f5f9000-7f5a7f7f9000 r-xp  libc.so.6（mmap 共享库）
# 7ffd5f000000-7ffd5f021000 rw-p  栈`
  },
  idea: `<p>虚拟地址空间让每个进程"独享"海量内存，还让共享库只需在物理内存里存一份、映射进所有进程。mm_struct 就是这个幻境的蓝图，页表是它的施工图。</p>`,
  related: ['mem-virt', 'mem-page', 'proc-exec']
};

N2['proc-ctx'] = {
  id: 'proc-ctx', type: 'proc', name: 'context switch', en: '上下文切换',
  kind: '进程 · 切换',
  zh: '从 A 进程切到 B 进程：保存一切，恢复一切。',
  desc: `
    <p>上下文切换是进程切换的"换台"操作：CPU 正在跑 A，突然要跑 B，必须把 A 的一切先存起来，再把 B 的一切拿出来。</p>
    <p>要保存/恢复的东西：</p>
    <ul>
      <li><b>寄存器</b> — 通用寄存器、指令指针、栈指针（压进各自的内核栈）</li>
      <li><b>页表</b> — 改写 CR3（下一条指令的访存就翻译到 B 的地址空间了）</li>
      <li><b>浮点/向量状态</b> — FPU、SIMD 寄存器（懒保存优化）</li>
      <li><b>内核栈</b> — 每个进程有自己的内核栈（16KB），切栈指针</li>
    </ul>
    <p>切换开销是"必要之恶"：一次约几微秒（含 TLB 冲刷、缓存失效）。所以调度器尽量避免频繁切换，也解释了为什么"进程越多，单个进程越慢"。</p>
    <p>Linux 的 <code>switch_to</code> 宏是切换的最后一跳，用汇编完成寄存器搬移。</p>`,
  source: {
    file: 'kernel/sched/core.c',
    note: 'context_switch：先切地址空间（mm），再切寄存器（switch_to）。',
    code: `/* kernel/sched/core.c —— 上下文切换（节选） */

static __always_inline struct rq *
context_switch(struct rq *rq, struct task_struct *prev,
	       struct task_struct *next)
{
	...
	/* 1. 切换地址空间（写 CR3，换页表） */
	if (!next->mm) {		/* 内核线程没有用户地址空间 */
		enter_lazy_tlb(prev->active_mm, next);
		next->active_mm = prev->active_mm;
	} else {
		membarrier_switch_mm(rq, prev->active_mm, next->mm);
		switch_mm_irqs_off(prev->active_mm, next->mm, next);
	}
	...
	/* 2. 切换寄存器、内核栈（汇编宏，最后一跳） */
	switch_to(prev, next, prev);
	...
	return rq;
}

/* switch_to 的汇编核心思想（arch/x86/entry/entry_64.S 附近）：
 * 保存 prev 的 rsp/rip 到其 task_struct
 * 载入 next 的 rsp/rip，ret 到 next 的内核栈继续执行 */`
  },
  idea: `<p>上下文切换是"分时复用"的物理实现：一个 CPU 通过快速换台，让几十个进程看起来在同时跑。理解了切换成本，就理解了为什么内核要做线程（共享地址空间，切换更便宜）、为什么要做事件驱动。</p>`,
  related: ['k-sched', 'proc-model', 'hw-cpu']
};

/* ==========================================================================
   六、内存管理
   ========================================================================== */

N2['mem-virt'] = {
  id: 'mem-virt', type: 'mem', name: 'virtual memory', en: '虚拟内存',
  kind: '内存 · 虚拟化',
  zh: '给每个进程画一个"假内存"，物理内存由内核偷偷调配。',
  desc: `
    <p><b>虚拟内存</b>是操作系统最伟大的抽象之一：每个进程都看到一块连续的、私有的、巨大的地址空间，完全不知道（也不需要知道）物理内存的真相。</p>
    <p>它是怎么做到的：</p>
    <ul>
      <li>CPU 的 MMU 把每个虚拟地址翻译成物理地址（查页表）。</li>
      <li>进程只能访问自己页表里"有效"的页——其他地址一律段错误。</li>
      <li>物理内存不够时，把不用的页<b>换出</b>到磁盘（swap），要用时再换入。</li>
    </ul>
    <p>带来的好处：</p>
    <ul>
      <li><b>隔离</b> — 进程 A 无法读写进程 B 的内存（各查各的页表）。</li>
      <li><b>共享</b> — 同一物理页可以映射进多个进程（共享库、共享内存）。</li>
      <li><b>超售</b> — 虚拟内存总量可以远超物理内存（靠 swap 和按需加载）。</li>
      <li><b>保护</b> — 每页带权限位（读/写/执行），代码段只读可执行。</li>
    </ul>`,
  source: {
    file: 'arch/x86/include/asm/pgtable_types.h',
    note: '页表项（PTE）的权限位：P 存在位、R/W 读写位、U/S 用户/内核位。',
    code: `/* arch/x86/include/asm/pgtable_types.h —— PTE 标志位（节选） */

#define _PAGE_BIT_PRESENT	0	/* 页在物理内存中 */
#define _PAGE_BIT_RW		1	/* 可写 */
#define _PAGE_BIT_USER		2	/* 用户态可访问（否则仅内核） */
#define _PAGE_BIT_ACCESSED	5	/* 被访问过（换页算法用） */
#define _PAGE_BIT_DIRTY		6	/* 被写过（换出时要写回） */
#define _PAGE_BIT_NX		63	/* 不可执行（NX 位） */

#define _PAGE_PRESENT	(_AT(pteval_t, 1) << _PAGE_BIT_PRESENT)
#define _PAGE_RW	(_AT(pteval_t, 1) << _PAGE_BIT_RW)
#define _PAGE_USER	(_AT(pteval_t, 1) << _PAGE_BIT_USER)
...
/* 内核页表项没有 _PAGE_USER：所以用户态访问内核地址 → 段错误 */
/* 用户页有 _PAGE_USER：内核可以访问（特权模式不受 U/S 限制） */`
  },
  idea: `<p>虚拟内存的本质是"间接层"：进程只见虚拟地址，物理页藏在内核手里。有了这层间接，隔离、共享、超售、按需加载全部成为可能——计算机科学里"任何问题都能加一层间接解决"的最佳注脚。</p>`,
  related: ['mem-page', 'proc-addr', 'hw-ram']
};

N2['mem-page'] = {
  id: 'mem-page', type: 'mem', name: 'page table', en: '页表',
  kind: '内存 · 映射',
  zh: '虚拟地址 → 物理地址的"翻译字典"，由 MMU 硬件查表。',
  desc: `
    <p>虚拟地址和物理地址的映射关系存在 <b>页表</b> 里。x86-64 用 <b>4 级页表</b>：PGD → P4D → PUD → PMD → PTE，每级 512 项，虚拟地址被切成 4 段索引 + 12 位页内偏移。</p>
    <p>一次地址翻译（无 TLB 命中时）要走 4 次内存访问——太慢！所以 CPU 内置 <b>TLB</b>（快表）缓存最近用过的翻译，命中率 99% 以上。</p>
    <p>关键设计：</p>
    <ul>
      <li><b>按需建表</b> — 大多数虚拟页从未被访问，页表项根本不存在（缺页时才逐级补齐）。</li>
      <li><b>大页</b> — 2MB/1GB 大页减少页表级数，数据库等大内存程序常用（HugeTLB）。</li>
      <li><b>进程切换 = 换根</b> — 每个进程有自己的页表树，切换进程只需把 CR3 指向新根。</li>
    </ul>`,
  source: {
    file: 'arch/x86/include/asm/pgtable.h',
    note: 'PTE 的读取与判断。pte_present 检查 P 位。',
    code: `/* arch/x86/include/asm/pgtable.h —— 页表操作（节选） */

static inline unsigned long pte_pfn(pte_t pte)
{
	return (pte_val(pte) & PTE_PFN_MASK) >> PAGE_SHIFT;
}

static inline int pte_present(pte_t pte)
{
	return pte_flags(pte) & (_PAGE_PRESENT | _PAGE_PROTNONE);
}

static inline pte_t pte_mkwrite(pte_t pte)
{
	return __pte(pte_val(pte) | _PAGE_RW);
}

/* 地址翻译的直观演示（x86-64 4 级页表）：
 * 虚拟地址 = [PGD索引(9) | PUD索引(9) | PMD索引(9) | PTE索引(9) | 偏移(12)]
 * 每级索引 9 位 → 每张表 512 项 × 8 字节 = 4KB = 恰好一页 */`
  },
  idea: `<p>页表是"虚拟内存"的施工图：MMU 每次访存都查它。它既是性能热点（TLB、大页），又是安全边界（内核/用户位、NX 位防代码注入）。读页表代码，等于读懂了现代 CPU 的内存模型。</p>`,
  related: ['mem-virt', 'mem-fault', 'hw-cpu']
};

N2['mem-fault'] = {
  id: 'mem-fault', type: 'mem', name: 'page fault', en: '缺页中断',
  kind: '内存 · 缺页',
  zh: '访问不存在的页 → CPU 抛异常 → 内核补上 → 继续执行。',
  desc: `
    <p>进程访问了一个"页表里没有或无效"的地址，MMU 无法翻译，触发 <b>缺页异常（page fault）</b>。这不是错误，而是内核的"延迟兑现"机制——它让很多魔法成为可能：</p>
    <ul>
      <li><b>懒分配</b> — malloc 只记账；首次写入才触发缺页，内核分配物理页并建映射。</li>
      <li><b>写时复制</b> — fork 后父子共享只读页；谁写谁缺页，内核复制该页并改成可写。</li>
      <li><b>按需换入</b> — 被换出到 swap 的页，访问时缺页，内核从磁盘读回。</li>
      <li><b>文件映射</b> — mmap 的文件页未缓存时，缺页从磁盘读入页缓存。</li>
    </ul>
    <p>缺页也分好坏：<b>轻微缺页</b>（页在内存，只是没映射）很快；<b>严重缺页</b>（要从磁盘读）很慢——所以程序的内存访问模式对性能影响巨大。</p>`,
  source: {
    file: 'arch/x86/mm/fault.c',
    note: 'do_page_fault 是 x86 缺页处理入口，按错误码分派。',
    code: `/* arch/x86/mm/fault.c —— x86 缺页处理（节选） */

static noinline void
do_page_fault(struct pt_regs *regs, unsigned long error_code)
{
	...
	/* 错误码位：P=1 页存在（保护违规） P=0 页不存在（真缺页）
	 *          W=1 写访问     U=1 用户态访问 */
	if (unlikely(error_code & X86_PF_PK)) { ... }
	...
	if (!(error_code & X86_PF_PROT)) {  /* 页不存在：正常缺页 */
		...
		fault = handle_mm_fault(vma, address, flags);
		...
	} else {
		/* 保护违规：写只读页（CoW 在这里处理） */
		...
	}
	...
}

/* 错误码位定义 */
#define X86_PF_PROT	(1 << 0)	/* 保护违规（页存在但权限不够） */
#define X86_PF_WRITE	(1 << 1)	/* 写操作触发 */
#define X86_PF_USER	(1 << 2)	/* 来自用户态 */
#define X86_PF_PRESENT	(1 << 3)	/* 页在内存中 */`
  },
  idea: `<p>缺页是虚拟内存的"发动机"：一切延迟兑现（懒分配、CoW、swap、mmap）都由它驱动。把缺页机制想成"按需付费"，Linux 内存管理的很多行为就都说得通了。</p>`,
  related: ['mem-page', 'mem-virt', 'mem-swap', 'proc-fork']
};

N2['mem-swap'] = {
  id: 'mem-swap', type: 'mem', name: 'swap & reclaim', en: '换页与回收',
  kind: '内存 · 回收',
  zh: '内存不够了：把不用的页请出去（swap），把要用的页请进来。',
  desc: `
    <p>物理内存是稀缺资源。当系统内存吃紧，内核启动 <b>内存回收（reclaim）</b>：</p>
    <ul>
      <li><b>回收顺序</b> — 先丢干净页（未修改的文件缓存页，直接丢弃，需要时再从磁盘读），再写回脏页，最后才把匿名页换到 swap。</li>
      <li><b>LRU 链表</b> — 每个内存区维护 active/inactive 两条 LRU 链表，回收时优先动不活跃的页。</li>
      <li><b>kswapd</b> — 内核线程，水位低于阈值时后台异步回收。</li>
      <li><b>直接回收</b> — 分配等不及 kswapd 时，分配者自己同步回收。</li>
      <li><b>OOM Killer</b> — 实在收不出来了，挑一个进程杀掉（选分高、占用大、非 root 的）。</li>
    </ul>
    <p><code>free</code> 命令里 <code>buff/cache</code> 大不是坏事——那是可回收的缓存，需要时会自动让出来。</p>`,
  source: {
    file: 'mm/vmscan.c',
    note: 'shrink_node 是回收的主循环：遍历 LRU，尝试换出/丢弃页。',
    code: `/* mm/vmscan.c —— 内存回收（节选） */

static void shrink_node(pg_data_t *pgdat, struct scan_control *sc)
{
	...
	/* 对 inactive / active 链表反复扫描 */
	do {
		...
		shrink_inactive_list(nr_scanned, lru, pgdat, sc, &nr_reclaimed);
		...
		shrink_active_list(nr_to_scan, lru, pgdat, sc, &nr_taken, &nr_scan);
		...
	} while (should_continue_reclaim(pgdat, sc));
	...
}

/* 回收的取舍（简化逻辑）：
 * 文件页干净 → 直接丢弃（free）
 * 文件页脏   → 写回磁盘后丢弃（writeback）
 * 匿名页     → 压缩后写入 swap（swapout）
 * 都救不了   → out_of_memory() 杀进程 */

/* 用户态观察 */
$ free -h
#               total   used   free  buff/cache
# Mem:           15G    6.2G   1.1G      8.0G   ← buff/cache 可回收
$ cat /proc/sys/vm/swappiness
# 60  （值越大越积极换匿名页）`
  },
  idea: `<p>回收策略是内核的"求生欲"：先牺牲缓存，再动用磁盘，最后才杀人（OOM）。理解回收顺序，就理解了为什么"内存被缓存占满"不可怕，也理解了 swap 是性能悬崖——换页比内存访问慢十万倍。</p>`,
  related: ['mem-virt', 'mem-fault', 'hw-disk']
};

N2['mem-alloc'] = {
  id: 'mem-alloc', type: 'mem', name: 'allocators', en: '伙伴 & slab 分配器',
  kind: '内存 · 分配',
  zh: '内核自己怎么"malloc"：伙伴分配器 + slab 分配器。',
  desc: `
    <p>内核自己也要分配内存，而且是<b>页和对象</b>两种粒度，各有专用分配器：</p>
    <ul>
      <li><b>伙伴分配器（buddy）</b> — 以页为单位，把内存按 2 的幂分成块（order 0~10）。分配 2^order 页，不够就分裂大块；释放时合并回大块。优点：外碎片少、分配快。缺点：最小单位一页（4KB），小对象浪费。</li>
      <li><b>slab 分配器（slub）</b> — 在内核页之上做"对象池"：每个 slab 是一页或几页，切成等大小的对象（如 task_struct、inode）。同类型对象复用，分配 O(1)，还能利用 CPU 缓存局部性（per-CPU 缓存）。</li>
    </ul>
    <p>开发者常用的 <code>kmalloc()</code> 底层就是：小对象走 slab，大对象（>8KB）直接走 buddy 页。</p>`,
  source: {
    file: 'mm/page_alloc.c',
    note: '伙伴分配器的核心分配函数。order 是 2 的幂指数。',
    code: `/* mm/page_alloc.c —— 伙伴分配器（节选） */

static inline
struct page *__alloc_pages_nodemask(gfp_t gfp_mask, unsigned int order,
				     int preferred_nid, nodemask_t *nodemask)
{
	...
	/* 先试 per-CPU 页表 + 快速路径 */
	page = get_page_from_freelist(alloc_gfp, order, alloc_flags, &ac);
	if (likely(page))
		goto out;
	...
	/* 慢路径：回收、压缩、甚至 OOM */
	page = __alloc_pages_slowpath(alloc_gfp, order, &ac);
	...
}

/* slab 分配器（mm/slub.c）的思想：
 * struct kmem_cache { ... };  每种对象一个 cache
 * kmem_cache_alloc(cache) → 从 per-CPU freelist 取一个对象
 * 对象释放后回 freelist，不还给 buddy → 避免反复建拆 */

/* 内核编程里的用法 */
struct task_struct *p;
p = kmem_cache_alloc(task_struct_cachep, GFP_KERNEL);  /* 拿一个 task_struct */
...
kmem_cache_free(task_struct_cachep, p);                /* 归还 */`
  },
  idea: `<p>两种分配器是"按规模分工"的典范：大块用 buddy（防碎片），小块用 slab（防浪费 + 快）。内核里没有免费的 malloc——每种对象都有自己的专属池，这是内核性能的基石之一。</p>`,
  related: ['mem-virt', 'hw-ram', 'proc-model']
};

/* ==========================================================================
   七、用户与权限
   ========================================================================== */

N2['user-uid'] = {
  id: 'user-uid', type: 'user', name: 'UID / GID', en: '用户标识',
  kind: '用户',
  zh: '用户的本质：一个数字。UID 0 是 root，其余是普通用户。',
  desc: `
    <p>Linux 里"用户"不是名字，是<b>数字</b>：<b>UID</b>（用户 ID）和 <b>GID</b>（组 ID）。名字只是给人看的（存在 /etc/passwd 里），内核只认数字。</p>
    <ul>
      <li><b>UID 0</b> — root 超级用户：内核权限检查时对 uid 0 几乎全部放行。</li>
      <li><b>UID 1~999</b> — 系统账户（daemon、sshd、www-data），给服务用。</li>
      <li><b>UID 1000+</b> — 普通用户（发行版不同起始值不同）。</li>
    </ul>
    <p>每个进程携带一组身份（存在 <code>struct cred</code> 里）：</p>
    <ul>
      <li><b>uid/gid</b> — 真实身份（启动进程的人）</li>
      <li><b>euid/egid</b> — 有效身份（权限检查用这个！）</li>
      <li><b>suid/sgid</b> — 保存的身份（setuid 程序的"后悔药"）</li>
      <li><b>fsuid/fsgid</b> — 文件系统访问用（历史遗留，现通常等于 euid）</li>
    </ul>
    <p>关键点：内核做权限检查用的是 <b>euid</b>，不是 uid。所以 setuid 程序（如 passwd）能以 root 权限运行。</p>`,
  source: {
    file: 'include/linux/cred.h',
    note: 'struct cred：进程身份凭据。current_cred() 取当前进程的 cred。',
    code: `/* include/linux/cred.h —— 进程凭据（节选） */

struct cred {
	...
	kuid_t		uid;		/* real UID of the task */
	kgid_t		gid;		/* real GID of the task */
	kuid_t		euid;		/* effective UID of the task */
	kgid_t		egid;		/* effective GID of the task */
	kuid_t		suid;		/* saved UID of the task */
	kgid_t		sgid;		/* saved GID of the task */
	kuid_t		fsuid;		/* UID for VFS operations */
	kgid_t		fsgid;		/* GID for VFS operations */
	...
	unsigned	cap_inheritable:1;   /* 能力集（capability） */
	...
};

/* 查看自己/他人的身份 */
$ id
uid=1000(zhang) gid=1000(zhang) groups=1000(zhang),27(sudo)
$ ps -o pid,uid,euid,cmd
# PID   UID  EUID CMD
# 123  1000  1000 bash
# 456     0     0 sshd: root        ← root 的进程
$ cat /proc/self/status | grep -E '^(Uid|Gid)'
# Uid:	1000	1000	1000	1000    ← real effective saved fsuid`
  },
  idea: `<p>把用户抽象成 UID，权限检查就变成数字比较；引入 euid/suid 的区分，setuid 提权才有安全空间。理解"权限检查看 euid"，就理解了 sudo、su、passwd 这些提权工具的原理。</p>`,
  related: ['user-passwd', 'user-perm', 'proc-model']
};

N2['user-passwd'] = {
  id: 'user-passwd', type: 'user', name: 'passwd / shadow', en: '账户数据库',
  kind: '用户 · 账户',
  zh: '用户账户存在哪：/etc/passwd 与 /etc/shadow 的分工。',
  desc: `
    <p>传统 Unix 把所有账户信息放在 <code>/etc/passwd</code>，但口令散列也放那里导致任何能读文件的人都能离线爆破。现代 Linux 拆成两个文件：</p>
    <ul>
      <li><code>/etc/passwd</code> — 世界可读：用户名、UID、GID、家目录、shell。口令字段用 <code>x</code> 占位。</li>
      <li><code>/etc/shadow</code> — 仅 root 可读：加密口令散列、口令策略（过期时间、最短期限…）。</li>
    </ul>
    <p>登录验证流程：<code>login</code>/<code>sshd</code> 读取输入 → 用 <code>crypt()</code>/<code>crypt_r()</code> 对输入加盐散列 → 与 shadow 里存的散列比对 → 相同则认证通过。</p>
    <p>散列算法：现代发行版用 <b>yescrypt / sha512crypt / argon2</b>，故意设计得很慢（计算一次要几十毫秒），让暴力破解代价高昂。</p>`,
  source: {
    file: '（用户态工具 shadow-utils：login/passwd/su 的实现）',
    note: 'passwd 文件格式与 shadow 文件格式。这是用户态 glibc/shadow-utils 的领域。',
    code: `# /etc/passwd —— 世界可读的账户表（7 字段）
# 用户名 : x占位 : UID : GID : 注释 : 家目录 : 登录shell
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
zhang:x:1000:1000:zhang,,,:/home/zhang:/bin/bash

# /etc/shadow —— 仅 root 可读（9 字段）
# 用户名 : 口令散列 : 最后修改日 : 最小期限 : 最大期限 : ...
zhang:$y$j9T$Zxhf...$K3mP...:19283:0:99999:7:::

# 内核侧视角：UID→用户名 的反查不归内核管
# 内核只认 UID；ps/ls 显示名字是用户态查 passwd 的结果
$ ls -ln /home          # -n 显示数字 UID，不查名字
# drwxr-xr-x 4 1000 1000 4096 ... zhang`
  },
  idea: `<p>passwd/shadow 的分拆是"最小权限"的范例：需要公开的信息公开，敏感的散列锁进 root-only 文件。安全设计的第一课就是——不要把所有秘密放在一个篮子里。</p>`,
  related: ['user-uid', 'user-perm', 'fs-etc']
};

N2['user-perm'] = {
  id: 'user-perm', type: 'user', name: 'permissions', en: '文件权限位',
  kind: '用户 · 权限',
  zh: 'rwx：读、写、执行，三类主体 × 三种权限。',
  desc: `
    <p>每个文件/目录带一组权限位，分成三组：<b>属主（u）/ 属组（g）/ 其他人（o）</b>，每组三个位：<b>读（r）/ 写（w）/ 执行（x）</b>。合起来就是 <code>ls -l</code> 看到的 <code>-rwxr-xr--</code>。</p>
    <table class="mini-table">
      <tr><th>权限</th><th>文件</th><th>目录</th></tr>
      <tr><td>r (4)</td><td>读内容</td><td>列出目录项（ls）</td></tr>
      <tr><td>w (2)</td><td>改内容</td><td>增删改名（需要 x）</td></tr>
      <tr><td>x (1)</td><td>执行</td><td>进入/穿过（cd、访问子项）</td></tr>
    </table>
    <p>权限检查发生在内核 <b>VFS 层</b>：每次 open/exec/stat 时，内核取出 inode 的属主/属组/权限位，与进程的 <b>fsuid/fsgid + 补充组</b> 比对：</p>
    <ul>
      <li>进程 fsuid == inode 属主 → 用属主权限</li>
      <li>否则进程属于 inode 属组 → 用属组权限</li>
      <li>否则 → 用其他人权限</li>
    </ul>
    <p>注意：<b>root（UID 0）基本无视权限位</b>（除非设置了只读挂载等）。</p>`,
  source: {
    file: 'fs/namei.c',
    note: 'generic_permission 是权限检查的通用实现。',
    code: `/* fs/namei.c —— 权限检查（节选） */

int generic_permission(struct inode *inode, int mask)
{
	...
	/* mask 是要检查的操作：MAY_READ / MAY_WRITE / MAY_EXEC */
	if (S_ISDIR(inode->i_mode)) {
		/* 目录的 x 表示能否进入 */
		if (!(mask & MAY_EXEC) || ...)
			mask &= ~MAY_EXEC;
	}
	...
	if (uid_eq(current_fsuid(), inode->i_uid))   /* 我是属主 */
		mode >>= 6;
	else if (in_group_p(inode->i_gid))            /* 我属于属组 */
		mode >>= 3;
	/* 否则就是 others */

	if (mask & ~mode & (MAY_READ | MAY_WRITE | MAY_EXEC))
		return -EACCES;                        /* 权限不足 */
	return 0;
}

/* 用户态操作 */
$ chmod 755 script.sh    # rwxr-xr-x：属主全权，组/他人只读执行
$ chown zhang:dev file   # 改属主/属组
$ umask 022              # 新文件默认权限 = 666 & ~022 = 644`
  },
  idea: `<p>权限位是"位图 + 三元匹配"的经典：9 个位表达三种主体三种能力。权限检查发生在每次文件访问的内核路径上——这也是"用户管理"最终落实成"访问控制"的最后一公里。</p>`,
  related: ['user-uid', 'fs-home', 'k-vfs']
};

N2['user-process'] = {
  id: 'user-process', type: 'user', name: 'user ↔ process', en: '用户与进程',
  kind: '用户 · 进程',
  zh: '进程替用户干活：身份从登录到执行的传递链。',
  desc: `
    <p>用户不会直接跑代码——是<b>进程</b>替用户干活。身份从登录开始层层传递：</p>
    <div class="flow">
      <span class="flow-step">login/sshd 认证</span><span class="flow-arrow">→</span>
      <span class="flow-step">fork + exec shell（uid 已切换）</span><span class="flow-arrow">→</span>
      <span class="flow-step">shell 再 fork 子进程</span><span class="flow-arrow">→</span>
      <span class="flow-step">子进程继承身份</span><span class="flow-arrow">→</span>
      <span class="flow-step">访问文件/设备</span>
    </div>
    <p>进程身份的传递规则：</p>
    <ul>
      <li><b>fork 继承</b> — 子进程完全复制父进程的 cred。</li>
      <li><b>exec 保留</b> — exec 新程序不改变 uid/gid（除非 setuid 位）。</li>
      <li><b>setuid 位</b> — 文件带 <code>s</code> 位时，exec 后 euid 临时变为文件属主（如 /usr/bin/passwd 属主 root），执行完用 suid 恢复。</li>
      <li><b>sudo</b> — 认证后 fork 一个 euid=0 的进程执行命令。</li>
    </ul>
    <p>所以"一个用户"的系统视图 = 一堆以该用户 uid 运行的进程 + 一堆该用户拥有的文件。查看：<code>ps -u zhang</code>、<code>ls -l</code>。</p>`,
  source: {
    file: 'fs/exec.c',
    note: 'exec 时处理 setuid/setgid 位：bprm_fill_uid 读取文件模式位。',
    code: `/* fs/exec.c —— exec 时的身份处理（节选） */

static int bprm_fill_uid(struct linux_binprm *bprm)
{
	...
	/* 读 inode 的模式位 */
	mode = READ_ONCE(inode->i_mode);
	...
	if (mode & S_ISUID) {                  /* setuid 位 */
		bprm->cred->euid = uid;        /* euid 变成文件属主 */
		...
	}
	if ((mode & (S_ISGID | S_IXGRP)) == (S_ISGID | S_IXGRP)) {
		bprm->cred->egid = gid;        /* setgid 同理 */
		...
	}
	...
}

/* 提权的"后悔药"：seteuid()/setuid() 可以在 suid 和原 uid 间切换 */

/* 一个 setuid 程序的典型场景 */
$ ls -l /usr/bin/passwd
# -rwsr-xr-x 1 root root ... /usr/bin/passwd   ← s 位！
# 普通用户运行它：euid 临时变 root → 能写 /etc/shadow → 改完口令
# 改完后进程马上把 euid 恢复为普通用户 */`
  },
  idea: `<p>身份传递链揭示了 Unix 安全模型的核心：权限跟着进程走，进程由用户派生。setuid 是"有限提权"的经典机制——只在这一个程序内提权，用完即恢复，避免全程 root。</p>`,
  related: ['user-uid', 'user-perm', 'proc-exec', 'proc-fork']
};

/* ==========================================================================
   补充：硬件节点 related（关系连线使用）
   ========================================================================== */
window.KDATA.nodes['hw-ram'].related = ['k-mm', 'mem-virt', 'mem-page', 'mem-swap'];
window.KDATA.nodes['hw-disk'].related = ['k-vfs', 'k-mm', 'mem-swap', 'fs-proc'];

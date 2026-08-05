/* ==========================================================================
   KDATA — 内容数据（第一部分：目录树 / 硬件 / 内核子系统 / 系统调用）
   所有源码片段取自真实 Linux 内核（kernel.org），路径均为内核源码树路径。
   ========================================================================== */

window.KDATA = {
  nodes: {},
  views: {
    panorama: { pos: [0, 7.2, 17.5], look: [0, 2.6, 0] },
    kernel:   { pos: [0, 4.6, 9.5],  look: [0, 2.6, 0] },
    fs:       { pos: [-3.5, 4.6, 11], look: [-6.2, 3.4, 0] },
    process:  { pos: [0, 6.4, 9.5],  look: [0, 5.6, 0] },
    memory:   { pos: [7.5, 5.4, 10], look: [7.5, 3.2, 0] },
    user:     { pos: [0, 6.0, 10.5], look: [0, 5.2, 0] },
  }
};

const N = window.KDATA.nodes;

/* ==========================================================================
   一、硬件层
   ========================================================================== */

N['hw-cpu'] = {
  id: 'hw-cpu', type: 'hw', name: 'CPU', en: 'Central Processing Unit',
  kind: '硬件',
  zh: '执行指令的引擎，也是 MMU（内存管理单元）的所在地。',
  desc: `
    <p>CPU 是系统的执行核心。它从内存取指令、译码、执行，把结果写回。但比"算得快"更重要的是：<b>CPU 是唯一能切换特权级的部件</b>。</p>
    <p>CPU 内部有两个关键寄存器组与内核直接相关：</p>
    <ul>
      <li><b>CR3</b> — 指向当前进程的页表基址，进程切换时由内核改写。</li>
      <li><b>MSR LSTAR</b> — 保存系统调用入口地址，<code>syscall</code> 指令会跳到这里。</li>
    </ul>
    <p>CPU 还内置 <b>MMU</b>：每次访存都经过它做虚拟地址 → 物理地址的翻译，命中 TLB 则一次完成，未命中则查页表，再未命中就触发缺页异常，把控制权交给内核。</p>
    <p>现代 x86 CPU 有 4 个特权级（ring 0~3），Linux 只使用两级：<b>ring 0 = 内核态</b>，<b>ring 3 = 用户态</b>。这就是"内核态 / 用户态"的物理基础。</p>`,
  source: {
    file: 'arch/x86/include/asm/processor-flags.h',
    note: 'CR0/CR3 等控制寄存器的位定义。PE=1 开启保护模式，PG=1 开启分页。',
    code: `/* arch/x86/include/asm/processor-flags.h */

/* CR0 bits */
#define X86_CR0_PE	(1UL << 0)	/* Protection Enable */
#define X86_CR0_WP	(1UL << 16)	/* Write Protect */
#define X86_CR0_PG	(1UL << 31)	/* Paging */

/* CR3: 页表基址寄存器，切换进程时内核会写它 */
/* CR4 bits */
#define X86_CR4_PAE	(1UL << 5)	/* Physical Address Extension */
#define X86_CR4_SMEP	(1UL << 20)	/* Supervisor Mode Execution Protection */
#define X86_CR4_SMAP	(1UL << 21)	/* Supervisor Mode Access Protection */`
  },
  related: ['k-sched', 'k-mm', 'sc-overview', 'mem-page'],
  idea: `<p>内核态/用户态的划分不是软件概念，而是 CPU 硬件强制实现的：用户态代码根本无法执行特权指令、无法访问内核页表，只有通过异常或中断"陷入"内核，由内核代码代为完成。这种"强制隔离"是操作系统的安全基石。</p>`
};

N['hw-ram'] = {
  id: 'hw-ram', type: 'hw', name: 'RAM', en: 'Physical Memory',
  kind: '硬件',
  zh: '物理内存：按 4KB 页框组织，是虚拟内存的"真身"。',
  desc: `
    <p>物理内存被内核按固定大小切成 <b>页框（page frame）</b>，x86 上默认每页 <b>4KB</b>。内核用一个全局结构 <code>struct page</code> 描述每个页框。</p>
    <p>用户程序永远不直接接触物理内存——它只看见自己的"虚拟地址空间"。虚拟页与物理页框的映射关系记录在页表里，由 MMU 硬件查表。</p>
    <p>物理内存的分区：</p>
    <ul>
      <li><b>内核镜像</b> — 内核代码和数据常驻内存（约几十 MB）。</li>
      <li><b>页框管理区</b> — 由伙伴分配器管理，供内核与用户页使用。</li>
      <li><b>DMA 区域</b> — 低端内存，供老式设备直接访问。</li>
    </ul>`,
  source: {
    file: 'include/linux/mm_types.h',
    note: 'struct page 描述每一个物理页框。flags 的低 32 位是各种状态位。',
    code: `/* include/linux/mm_types.h */

struct page {
	unsigned long		flags;		/* 状态位：PG_locked, PG_dirty,
						   PG_swapcache, PG_active ... */
	union {
		struct {	/* 页框管理链表节点 */
			struct list_head lru;
			...
		};
		struct {	/* 页缓存 / 文件映射 */
			struct address_space *mapping;
			...
		};
		...
	};
	union {
		unsigned long	private;
		...
	};
	...
};`
  },
  idea: `<p>为什么不直接给进程分配物理地址？因为页框是"资源"，必须由内核统一记账、回收、换出。struct page 就是这份账本——每个物理页框一页账目，内存多大，账本就有多大。</p>`,
};

N['hw-disk'] = {
  id: 'hw-disk', type: 'hw', name: 'Disk', en: 'Block Device',
  kind: '硬件',
  zh: '块设备：持久化存储，通过块设备层与页缓存接入文件系统。',
  desc: `
    <p>磁盘是最慢的存储层级（毫秒级随机访问，比内存慢 10^5 倍），所以内核做了两层优化：</p>
    <ul>
      <li><b>页缓存（page cache）</b> — 读过的文件页留在内存里，下次直接命中，不碰磁盘。</li>
      <li><b>I/O 调度与合并</b> — 把分散的小请求合并成大块顺序读写（电梯算法 / 多队列）。</li>
    </ul>
    <p>文件系统（ext4、XFS、Btrfs）运行在块设备之上，把"文件"这个抽象变成磁盘上的 inode + 数据块。内核还有一层 <b>块设备层（block layer）</b>：所有文件系统最终都把 I/O 请求打包成 <code>struct bio</code>，交给设备驱动。</p>`,
  source: {
    file: 'include/linux/blk_types.h',
    note: 'struct bio 是块设备 I/O 的基本单元：一个 bio 描述一段要读写的数据。',
    code: `/* include/linux/blk_types.h */

struct bio {
	struct bio		*bi_next;	/* 请求队列中的下一个 */
	struct block_device	*bi_bdev;
	unsigned int		bi_opf;		/* 操作类型：读/写/刷新... */
	unsigned short		bi_vcnt;	/* 段（页）数量 */
	...
	struct bio_vec		*bi_io_vec;	/* 每一段的地址/长度 */
	...
};`
  },
  idea: `<p>磁盘慢是操作系统的第一敌人。页缓存 + 预读 + I/O 合并，全部是为了把"碰磁盘"的次数降到最低。理解 Linux 的很多设计（包括 OOM、内存回收），都要从"磁盘太慢"这个前提出发。</p>`,
};

/* ==========================================================================
   二、目录树（文件系统）
   ========================================================================== */

N['fs-root'] = {
  id: 'fs-root', type: 'fs', name: '/', en: 'root directory',
  kind: '目录',
  zh: '一切目录的起点，根目录。',
  desc: `
    <p><b>/</b> 是整个文件系统的根。在 Linux 中"一切皆文件"，/ 就是这棵树的树根。</p>
    <p>根目录下的一级目录遵循 <b>FHS（文件系统层次标准）</b>，各司其职：</p>
    <ul>
      <li><b>/bin /sbin /usr</b> — 可执行程序</li>
      <li><b>/etc</b> — 系统配置</li>
      <li><b>/home /root</b> — 用户数据</li>
      <li><b>/dev /proc /sys</b> — 设备与内核信息（虚拟文件系统）</li>
      <li><b>/var /tmp</b> — 运行时数据</li>
    </ul>
    <p>注意：目录不是"文件夹"那么简单——目录也是一个文件，内容是"文件名 → inode 号"的映射表。目录的读权限决定你能不能列出内容，执行权限决定你能不能进入。</p>`,
  source: {
    file: 'fs/namei.c',
    note: 'path_init() 解析路径的起点：从根或当前目录的 dentry 出发，逐级查找。',
    code: `/* fs/namei.c —— 路径解析的核心流程（精简） */

static const char *path_init(struct nameidata *nd, unsigned flags)
{
	...
	if (flags & LOOKUP_ROOT) {
		nd->path = nd->root;		/* 从根目录出发 */
	} else if (nd->root.mnt && ...) {
		...
	} else {
		/* 从当前工作目录出发 */
		nd->path = current->fs->pwd;
	}
	...
	nd->inode = nd->path.dentry->d_inode;
	...
	return filename;	/* 返回待解析的路径 */
}`
  },
  idea: `<p>路径解析（pathname lookup）是内核里最频繁的操作之一。现代内核用 dentry 缓存 + RCU 无锁查找把"一次 ls"从毫秒级压到微秒级。理解 / 的本质，就是理解"路径 = 从根出发的 dentry 链"。</p>`,
  related: ['fs-etc', 'fs-home', 'fs-usr', 'fs-proc', 'fs-dev']
};

N['fs-bin'] = {
  id: 'fs-bin', type: 'fs', name: '/bin', en: 'essential binaries',
  kind: '目录',
  zh: '系统必备的基础命令（ls、cat、cp、sh…）。',
  desc: `
    <p><b>/bin</b> 存放系统启动和单用户模式下必须的基础命令：<code>ls</code>、<code>cat</code>、<code>cp</code>、<code>mv</code>、<code>sh</code> 等。</p>
    <p>在现代发行版中 /bin 通常是指向 <b>/usr/bin</b> 的软链接（usrmerge 合并），这是为了统一管理。</p>
    <p>这些命令都是 <b>用户态程序</b>：它们自己不做任何特权操作，一切通过系统调用（open/read/write/fork/exec）请求内核代办。比如 <code>ls</code> 会调用 <code>getdents()</code> 读取目录项。</p>`,
  source: {
    file: 'arch/x86/entry/syscalls/syscall_64.tbl',
    note: '系统调用表：编号、abi、名字、内核函数名。ls 读目录用的是 getdents。',
    code: `# arch/x86/entry/syscalls/syscall_64.tbl（节选）
#
# 编号  abi    名称              入口点
0	common	read			sys_read
1	common	write			sys_write
2	common	open			sys_open
3	common	close			sys_close
...
59	common	execve			sys_execve
...
78	common	getdents		sys_getdents
...
257	common	openat			sys_openat
...`
  },
  idea: `<p>用户态程序与内核的"对话语言"就是系统调用号。一个 ls 命令，从执行到输出，会穿越用户态→内核态→VFS→具体文件系统→块设备，最后再回到用户态。整个课程都在讲这条路径。</p>`,
  related: ['sc-read', 'k-vfs', 'fs-root']
};

N['fs-etc'] = {
  id: 'fs-etc', type: 'fs', name: '/etc', en: 'system configuration',
  kind: '目录',
  zh: '系统配置文件：决定"这台机器是什么样"。',
  desc: `
    <p><b>/etc</b> 存放几乎全部系统级配置：</p>
    <ul>
      <li><code>/etc/passwd</code> — 用户账户数据库（用户名、UID、家目录、shell）</li>
      <li><code>/etc/shadow</code> — 加密口令（仅 root 可读）</li>
      <li><code>/etc/fstab</code> — 开机自动挂载表</li>
      <li><code>/etc/hosts</code> / <code>/etc/resolv.conf</code> — 网络配置</li>
      <li><code>/etc/ssh/sshd_config</code> — SSH 服务配置</li>
    </ul>
    <p>配置文件的本质：<b>用文本描述状态</b>。系统启动时，各服务读取这些文件决定自己的行为。这也是"Linux 一切皆文件、配置可读可改"哲学的体现。</p>`,
  source: {
    file: 'fs/proc/base.c（类比：内核如何把状态导出成"文件"）',
    note: '内核把运行时信息暴露成 /proc 下的虚拟文件；/etc 则是用户态的配置文件，两者互补。',
    code: `# /etc/passwd（一行一个用户，7 个字段，冒号分隔）
# 用户名:口令占位:x:UID:GID:注释:家目录:登录shell
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
zhang:x:1000:1000:zhang,,,:/home/zhang:/bin/bash`
  },
  idea: `<p>把配置做成可读文本，让系统"透明可审计"。这是 Unix 传统：配置不是藏在二进制数据库里（对比 Windows 注册表），而是普通文件，可以用任意工具查看、修改、版本管理。</p>`,
  related: ['user-passwd', 'user-perm']
};

N['fs-home'] = {
  id: 'fs-home', type: 'fs', name: '/home', en: 'user home directories',
  kind: '目录',
  zh: '普通用户的私有空间，每人一个目录。',
  desc: `
    <p><b>/home/&lt;用户名&gt;</b> 是每个普通用户的家目录：桌面、文档、配置（<code>.bashrc</code>、<code>.config</code>）都在这里。</p>
    <p>家目录默认权限是 <code>700</code>（rwx------），即只有本人和 root 能进入——这是"用户隔离"在文件系统层面的体现。</p>
    <p>用户登录时，shell 的工作目录就是家目录，环境变量 <code>$HOME</code> 指向它。系统创建用户时用 <code>useradd</code> 自动生成家目录，并从 <code>/etc/skel</code> 拷贝骨架文件。</p>`,
  source: {
    file: 'include/uapi/linux/stat.h',
    note: '文件权限位的真实定义：S_IRUSR 等位就是 ls -l 里 rwx 的底层表示。',
    code: `/* include/uapi/linux/stat.h —— 权限位定义（八进制） */

#define S_IRUSR	00400	/* read by owner */
#define S_IWUSR	00200	/* write by owner */
#define S_IXUSR	00100	/* execute/search by owner */

#define S_IRGRP	00040	/* read by group */
#define S_IWGRP	00020	/* write by group */
#define S_IXGRP	00010	/* execute/search by group */

#define S_IROTH	00004	/* read by others */
#define S_IWOTH	00002	/* write by others */
#define S_IXOTH	00001	/* execute/search by others */

/* 777 = 0777 = 全部权限；700 即仅 owner 可读可写可执行 */`
  },
  idea: `<p>权限位是一份 12 位的位图（rwx × 3 + setuid/setgid/sticky），存放在 inode 里。每次打开文件时，内核用进程的 fsuid 与 inode 属主比对，决定放行还是返回 EACCES。这就是"用户管理"落地成"访问控制"的地方。</p>`,
  related: ['user-perm', 'user-uid', 'fs-root2']
};

N['fs-root2'] = {
  id: 'fs-root2', type: 'fs', name: '/root', en: 'root\'s home',
  kind: '目录',
  zh: '超级用户 root 的家目录（普通用户无权进入）。',
  desc: `
    <p><b>/root</b> 是 UID 0（超级用户）的家目录。普通用户没有权限进入，这是权限隔离的一部分。</p>
    <p>root 是系统中唯一的"特权账户"：UID = 0。内核在权限检查时有一条特殊规则——<b>UID 为 0 的进程几乎拥有全部权限</b>（绕过绝大多数检查）。</p>
    <p>因此 root 口令的安全至关重要：拿到 root 就等于拿到整台机器。现代系统通过 <code>sudo</code> 机制让普通用户临时提权，而不用共享 root 口令。</p>`,
  source: {
    file: 'include/linux/capability.h',
    note: 'Linux 把 root 的"全能"拆成了 40+ 项能力（capability），可精细授予。',
    code: `/* include/linux/capability.h（节选） */

#define CAP_CHOWN		0	/* 修改文件属主 */
#define CAP_DAC_OVERRIDE	1	/* 绕过文件读写权限检查 */
#define CAP_KILL		5	/* 向任意进程发信号 */
#define CAP_NET_BIND_SERVICE	10	/* 绑定特权端口(<1024) */
#define CAP_SYS_ADMIN		21	/* 大量系统管理操作 */
#define CAP_SYS_RAWIO		17	/* 直接访问硬件 */
...`
  },
  idea: `<p>传统 Unix 的"root 全知全能"太粗糙。Linux 用 capability 把 root 拆成可组合的细粒度权限，docker 容器就是靠"只给容器需要的几个 capability"实现隔离的。</p>`,
  related: ['user-uid', 'user-perm']
};

N['fs-usr'] = {
  id: 'fs-usr', type: 'fs', name: '/usr', en: 'user system resources',
  kind: '目录',
  zh: '系统软件的主体：程序、库、头文件、源码。',
  desc: `
    <p><b>/usr</b>（Unix System Resources）是现代发行版的软件主体：</p>
    <ul>
      <li><code>/usr/bin</code> — 绝大多数用户命令</li>
      <li><code>/usr/sbin</code> — 系统管理命令</li>
      <li><code>/usr/lib</code> — 动态链接库（.so 文件）</li>
      <li><code>/usr/include</code> — C 头文件（写程序时 #include 的就是这里）</li>
      <li><code>/usr/src</code> — 内核源码（如有安装）</li>
      <li><code>/usr/local</code> — 管理员手动编译安装的软件</li>
    </ul>
    <p>usrmerge 之后，/bin → /usr/bin、/sbin → /usr/sbin、/lib → /usr/lib，系统只剩一棵软件树。</p>`,
  source: {
    file: 'lib/（动态链接器入口，如 glibc）',
    note: '程序启动时，动态链接器 ld.so 先把依赖的 .so 库映射进地址空间，再跳转到 main。',
    code: `# 一个 C 程序从源码到进程的旅程
$ cat hello.c
#include <stdio.h>          // /usr/include/stdio.h

int main(void) {
    printf("hello, world\\n");
    return 0;
}

$ gcc hello.c -o hello     # 编译 + 链接（默认动态链接）
$ ldd hello                # 查看依赖的共享库
	linux-vdso.so.1 (0x00007fff...)
	libc.so.6 => /usr/lib/x86_64-linux-gnu/libc.so.6

$ ./hello                  # 加载器载入 libc，进入 main()
hello, world`
  },
  idea: `<p>/usr 让我们看到"程序 = 代码 + 库"。动态链接让几百 MB 的软件只占几 MB 磁盘：printf 的实现在 libc 里，所有程序共享一份。</p>`,
  related: ['proc-exec', 'proc-addr']
};

N['fs-var'] = {
  id: 'fs-var', type: 'fs', name: '/var', en: 'variable data',
  kind: '目录',
  zh: '运行时变化的数据：日志、缓存、队列。',
  desc: `
    <p><b>/var</b> 存放运行时不断变化的数据：</p>
    <ul>
      <li><code>/var/log</code> — 系统日志（syslog、journald）</li>
      <li><code>/var/cache</code> — 软件包缓存（apt 下载的 .deb）</li>
      <li><code>/var/spool</code> — 打印队列、邮件队列</li>
      <li><code>/var/tmp</code> — 重启后保留的临时文件</li>
      <li><code>/var/lib</code> — 服务状态数据库（dpkg、mysql）</li>
    </ul>
    <p>与 /tmp 的区别：/tmp 重启即清空，/var 的数据跨重启保留。把"程序"和"数据"分开，是 FHS 的核心思想。</p>`,
  source: {
    file: 'fs/proc/proc_sysctl.c（类比：/proc/sys 的运行时可调参数）',
    note: '内核运行参数通过 /proc/sys 动态读写，与 /var 一样属于"运行时数据"。',
    code: `# /var 下常见的"活数据"示例
$ ls /var/log/           # 日志目录
syslog  auth.log  kern.log  dpkg.log  ...

$ tail -f /var/log/syslog
Aug  5 23:40:01 host kernel: [12345.678] wlan0: link up

# 内核运行参数（动态可调，立即生效）
$ cat /proc/sys/vm/swappiness   # 内存回收时倾向换页的程度
60
$ echo 10 > /proc/sys/vm/swappiness  # 立即修改（root）`
  },
  idea: `<p>/var 的存在提醒我们：系统是"活的"。日志、缓存、状态都是过程数据，需要专门的位置存放、轮转、清理。内核的 /proc/sys 则更进一步——连内核参数都可以在运行时热改。</p>`,
  related: ['fs-proc', 'k-mm']
};

N['fs-tmp'] = {
  id: 'fs-tmp', type: 'fs', name: '/tmp', en: 'temporary files',
  kind: '目录',
  zh: '临时文件：所有人可写，重启即清。',
  desc: `
    <p><b>/tmp</b> 是全局临时目录：<b>任何人可写</b>（sticky bit，权限 1777），但只有属主能删除自己的文件。</p>
    <p>sticky bit（粘滞位）就是 <code>/tmp</code> 权限末尾的 <code>t</code>：它告诉内核"这个目录里，只有文件属主（或 root）能删除/改名文件"，防止用户互相删除临时文件。</p>
    <p>现代系统上 /tmp 常由 tmpfs 提供——tmpfs 是<b>基于内存的文件系统</b>，数据在 RAM 里，断电即失，但速度极快。</p>`,
  source: {
    file: 'mm/shmem.c',
    note: 'tmpfs 的内核实现就是 shmem：一种把"文件"存进页缓存/匿名页的特殊文件系统。',
    code: `/* mm/shmem.c —— tmpfs 的核心（节选） */

static const struct file_operations shmem_file_operations = {
	.mmap		= shmem_mmap,
	.get_unmapped_area = shmem_get_unmapped_area,
	...
};

static int shmem_fill_super(struct super_block *sb, void *data, int silent)
{
	...
	sb->s_fs_info = sbinfo;
	...
}
/* 挂载：mount -t tmpfs tmpfs /tmp */
/* 写入 tmpfs 的文件实际落在页缓存里，不落盘 */`
  },
  idea: `<p>tmpfs 展示了"文件系统"和"内存"的统一：文件不过是一批带名字的页。tmpfs 的文件页就是普通内存页，所以读 /tmp 里的文件几乎零开销。</p>`,
  related: ['hw-ram', 'mem-page']
};

N['fs-lib'] = {
  id: 'fs-lib', type: 'fs', name: '/lib', en: 'shared libraries & modules',
  kind: '目录',
  zh: '动态库与内核模块（多数已并入 /usr/lib）。',
  desc: `
    <p><b>/lib</b> 历史上存放系统启动和 /bin /sbin 需要的共享库：<code>libc.so</code>、<code>ld-linux.so</code> 等，还有内核模块 <code>/lib/modules/$(uname -r)/</code>。</p>
    <p>内核模块（.ko 文件）是可动态加载的内核代码：驱动、文件系统、安全模块都能以模块形式插入运行中的内核，无需重新编译。</p>
    <p>加载模块用 <code>insmod</code> / <code>modprobe</code>，本质是一次 <code>init_module()</code> 系统调用，把模块二进制搬进内核并执行其 <code>init</code> 函数。</p>`,
  source: {
    file: 'kernel/module.c（模块加载入口，节选）',
    note: 'init_module 系统调用 → load_module() → 执行模块的 init 函数。',
    code: `/* kernel/module.c —— SYSCALL_DEFINE3(init_module) */

SYSCALL_DEFINE3(init_module, void __user *, umod,
		unsigned long, len, const char __user *, uargs)
{
	...
	return load_module(&info, uargs, 0);
}

/* 模块自身的样子（经典 hello world 内核模块） */
#include <linux/module.h>
#include <linux/kernel.h>

static int __init hello_init(void)
{
	pr_info("Hello, kernel!\\n");   /* 打印到内核日志 dmesg */
	return 0;
}
static void __exit hello_exit(void)
{
	pr_info("Goodbye, kernel!\\n");
}

module_init(hello_init);     /* 加载时调用 */
module_exit(hello_exit);     /* 卸载时调用 */
MODULE_LICENSE("GPL");`
  },
  idea: `<p>模块机制让内核"可裁剪可扩展"：厂商驱动、新文件系统不用改主线内核就能装上。代价是模块运行在 ring 0，一个 bug 就能搞崩整个系统——这也解释了为什么"驱动崩 = 系统崩"。</p>`,
  related: ['k-drivers', 'hw-cpu']
};

N['fs-dev'] = {
  id: 'fs-dev', type: 'fs', name: '/dev', en: 'device files',
  kind: '目录',
  zh: '设备文件：把硬件变成"文件"，open 它就是在访问设备。',
  desc: `
    <p><b>/dev</b> 是"一切皆文件"哲学的巅峰：每个硬件设备在这里都是一个文件。</p>
    <ul>
      <li><code>/dev/sda</code> — 第一块 SATA/SCSI 磁盘（块设备）</li>
      <li><code>/dev/tty0</code> — 终端（字符设备）</li>
      <li><code>/dev/null</code> — 黑洞：写入丢弃，读出 EOF</li>
      <li><code>/dev/random</code> — 随机数生成器</li>
    </ul>
    <p>设备文件分两类：<b>字符设备</b>（按字节流，如键盘、串口）和<b>块设备</b>（按块读写，如磁盘）。它们用 <b>主设备号 + 次设备号</b> 定位驱动：主设备号找到驱动，次设备号找到具体设备实例。</p>
    <p>现代系统用 <b>devtmpfs / udev</b> 自动创建设备文件——内核枚举到新硬件时自动在 /dev 里生成对应节点。</p>`,
  source: {
    file: 'include/linux/major.h',
    note: '主设备号分配表（节选）。mknod /dev/xxx c 主号 次号 即可手动创建设备文件。',
    code: `/* include/linux/major.h —— 主设备号（节选） */

#define MEM_MAJOR		1	/* /dev/mem, /dev/kmem, /dev/null ... */
#define TTY_MAJOR		4	/* /dev/tty0, tty1 ... */
#define SCSI_DISK0_MAJOR	8	/* /dev/sda ... */
#define MISC_DYNAMIC_MINOR	255	/* 动态次设备号 */

/* 一个字符设备驱动如何注册自己（drivers/char/xxx.c 模式） */
static const struct file_operations my_fops = {
	.owner		= THIS_MODULE,
	.open		= my_open,
	.read		= my_read,
	.write		= my_write,
};

static int __init my_init(void)
{
	/* 注册字符设备：主设备号 + fops */
	return register_chrdev(MY_MAJOR, "mydev", &my_fops);
}`
  },
  idea: `<p>把设备抽象成文件，意味着用户态可以用 read/write 统一操作一切 I/O——不用为每种硬件学一套 API。内核的 VFS 层 + 设备驱动的 file_operations 就是这套统一接口。</p>`,
  related: ['k-drivers', 'k-vfs']
};

N['fs-proc'] = {
  id: 'fs-proc', type: 'fs', name: '/proc', en: 'process information pseudo-fs',
  kind: '目录',
  zh: '进程信息虚拟文件系统：cat 一个文件，就是在读内核内存。',
  desc: `
    <p><b>/proc</b> 是内核的"体检窗口"——一个不占磁盘的虚拟文件系统，文件内容是内核实时生成的：</p>
    <ul>
      <li><code>/proc/&lt;pid&gt;/</code> — 每个进程一个目录</li>
      <li><code>/proc/self/status</code> — 当前进程的状态（含 UID/GID、内存、信号）</li>
      <li><code>/proc/cpuinfo</code> — CPU 信息</li>
      <li><code>/proc/meminfo</code> — 内存使用详情</li>
      <li><code>/proc/interrupts</code> — 中断统计</li>
      <li><code>/proc/sys/</code> — 可调内核参数</li>
    </ul>
    <p>读 /proc 文件时，内核调用该文件对应的 <b>proc_fops</b> 里的 read 函数，把实时数据填进缓冲区——你看到的每个字节都是"现算"的。</p>`,
  source: {
    file: 'fs/proc/array.c',
    note: 'proc 文件如何"现算"数据：do_task_stat() 从 task_struct 里收集字段拼成一行文本。',
    code: `/* fs/proc/array.c —— /proc/<pid>/stat 的数据来源（节选） */

static int do_task_stat(struct seq_file *m, struct pid_namespace *ns,
			struct pid *pid, struct task_struct *task, int whole)
{
	...
	/* 从 task_struct 取字段，格式化输出 */
	seq_printf(m, "%d (%s) %c", pid_nr_ns(pid, ns), tcomm, state);
	seq_printf(m, " %d %d %d", ppid, pgid, sid);
	seq_printf(m, " %lu %lu %lu", minflt, majflt, ...);
	...
	return 0;
}

/* 挂接：proc_create("stat", ...) 让 /proc/<pid>/stat 指向这个函数 */`
  },
  idea: `<p>/proc 模糊了"文件"与"接口"的界限：内核把内部状态以文件形式导出，用户用 cat/grep/awk 就能诊断系统——不需要专门的调试工具。这是 Unix "小而通用的工具组合"哲学的极致。</p>`,
  related: ['proc-model', 'k-mm']
};

N['fs-sys'] = {
  id: 'fs-sys', type: 'fs', name: '/sys', en: 'sysfs — device & driver model',
  kind: '目录',
  zh: '设备与驱动的结构化视图（kobject 模型）。',
  desc: `
    <p><b>/sys</b>（sysfs）把内核的<b>设备模型</b>暴露成目录树：每个设备、驱动、总线、电源状态都是一个目录或文件。</p>
    <ul>
      <li><code>/sys/class/</code> — 按功能分类的设备（net、block、tty…）</li>
      <li><code>/sys/bus/</code> — 按总线分类（pci、usb、platform…）</li>
      <li><code>/sys/devices/</code> — 设备树的真实层级</li>
    </ul>
    <p>sysfs 的底层是 <b>kobject</b> 机制：内核里每个设备对象都挂到一个 kobject 树上，sysfs 就是这棵树的用户态镜像。udev 靠监听 sysfs 事件自动创建 /dev 节点。</p>`,
  source: {
    file: 'lib/kobject.c',
    note: 'kobject 是 sysfs 的基石：每个 kobject 对应 sysfs 里的一个目录。',
    code: `/* lib/kobject.c —— kobject 与 sysfs 的关系（节选） */

int kobject_add_internal(struct kobject *kobj)
{
	...
	/* 在 sysfs 中创建目录 */
	parent = kobject_get_parent(kobj);
	...
	kobj->sd = sysfs_create_dir_ns(kobj, kobject_namespace(kobj));
	...
}

/* 一个设备驱动注册设备时，内核自动在 /sys 下生成条目 */
static int __init mydrv_init(void)
{
	struct device *dev;
	...
	device_create(dev_class, NULL, MKDEV(MAJOR, 0), NULL, "mydev%d", 0);
	/* 之后 /sys/class/myclass/mydev0 就出现了 */
	return 0;
}`
  },
  idea: `<p>/proc 是一维的"键值对"，/sys 是结构化的"对象树"。当硬件规模爆炸（PCIe/USB 热插拔、电源管理），需要一棵树来描述"谁挂在谁上面"。这就是 sysfs 存在的原因。</p>`,
  related: ['fs-dev', 'k-drivers']
};

N['fs-boot'] = {
  id: 'fs-boot', type: 'fs', name: '/boot', en: 'boot loader files',
  kind: '目录',
  zh: '引导文件：内核镜像 vmlinuz、initrd、grub 配置。',
  desc: `
    <p><b>/boot</b> 存放开机需要的文件：</p>
    <ul>
      <li><code>vmlinuz-*</code> — 压缩过的内核镜像</li>
      <li><code>initrd.img-*</code> — 初始内存盘（临时根文件系统）</li>
      <li><code>config-*</code> — 编译内核时的配置</li>
      <li><code>grub/</code> — GRUB 引导加载器配置</li>
    </ul>
    <p>开机流程：BIOS/UEFI → GRUB（引导加载器）→ 载入 vmlinuz 到内存 → 内核解压自举 → <code>start_kernel()</code> → 挂载 initrd 作为临时根 → 切换真实根文件系统 → 启动 PID 1（systemd/init）。</p>`,
  source: {
    file: 'init/main.c',
    note: 'start_kernel() 是内核 C 代码的入口：init_task 之后的第一个大函数。',
    code: `/* init/main.c —— 内核的 C 语言入口（节选） */

asmlinkage __visible void __init start_kernel(void)
{
	char *command_line;
	...
	boot_cpu_init();            /* 初始化启动 CPU */
	...
	mm_init();                  /* 内存管理子系统初始化 */
	...
	sched_init();               /* 调度器初始化 */
	...
	vfs_caches_init();          /* VFS 与文件系统缓存初始化 */
	...
	rest_init();                /* 创建 kernel_init 与 kthreadd */
}

/* rest_init() 里诞生的第一个"进程" */
static noinline void __ref rest_init(void)
{
	...
	pid = kernel_thread(kernel_init, NULL, CLONE_FS);   /* PID 1 */
	...
	pid = kernel_thread(kthreadd, NULL, CLONE_FS | CLONE_FILES); /* PID 2 */
	...
}`
  },
  idea: `<p>start_kernel 是"万物起源"：从一行汇编跳到这，内核依次点亮 CPU、内存、调度、文件系统，最后生出 PID 1（init/systemd）和 PID 2（kthreadd）。学习内核从这里读起是最顺的路径。</p>`,
  related: ['k-init', 'fs-root']
};

/* ==========================================================================
   三、内核态子系统
   ========================================================================== */

N['k-init'] = {
  id: 'k-init', type: 'kernel', name: 'start_kernel', en: '内核启动',
  kind: '内核 · 启动',
  zh: '内核 C 代码的入口：从 bootloader 交棒到内核的第一行 C。',
  desc: `
    <p>计算机开机后，<b>引导加载器（GRUB）</b>把 <code>vmlinuz</code> 载入内存，内核先用汇编完成解压和实模式→保护模式切换，然后跳进 <code>start_kernel()</code>。</p>
    <p>start_kernel 按依赖顺序初始化所有子系统：先 CPU，再内存，再调度器，再 VFS……最后调用 <code>rest_init()</code> 创建两个内核线程：</p>
    <ul>
      <li><b>PID 1 kernel_init</b> — 最终执行 <code>execve("/sbin/init")</code>，变成用户态第一个进程（systemd）。</li>
      <li><b>PID 2 kthreadd</b> — 内核线程的"管家"，后续所有内核线程都由它 fork。</li>
    </ul>
    <p>从这里能看清整个内核的"地图"：每个 init 函数对应一个子系统。</p>`,
  source: {
    file: 'init/main.c',
    note: '完整启动顺序：trap_init → mm_init → sched_init → vfs_caches_init → rest_init。',
    code: `/* init/main.c —— start_kernel 全貌（节选） */

asmlinkage __visible void __init start_kernel(void)
{
	...
	setup_arch(&command_line);      /* 架构相关：页表、内存布局 */
	...
	trap_init();                    /* 中断/异常门初始化 */
	...
	mm_init();                      /* 内存管理：buddy、slab、页缓存 */
	...
	sched_init();                   /* 就绪队列、调度类 */
	...
	vfs_caches_init();              /* dentry/inode 缓存、文件系统注册表 */
	...
	rest_init();
}

static noinline void __ref rest_init(void)
{
	rcu_scheduler_starting();
	...
	pid = kernel_thread(kernel_init, NULL, CLONE_FS);      /* → PID 1 */
	...
	pid = kernel_thread(kthreadd, NULL, CLONE_FS | CLONE_FILES); /* → PID 2 */
	...
}

static int __ref kernel_init(void *unused)
{
	...
	/* 挂载根文件系统后，exec 用户态第一个程序 */
	if (ramdisk_execute_command) {
		ret = run_init_process(ramdisk_execute_command);
		...
	}
	...
	ret = run_init_process("/sbin/init");   /* systemd / sysvinit */
	...
}`
  },
  idea: `<p>启动顺序 = 依赖顺序：必须先有内存才能建调度器，必须有调度器才能 fork 线程，必须有 VFS 才能挂根文件系统。读启动代码，等于拿到了内核的"目录索引"。</p>`,
  related: ['hw-cpu', 'k-sched', 'k-mm', 'k-vfs']
};

N['k-sched'] = {
  id: 'k-sched', type: 'kernel', name: 'scheduler', en: '进程调度',
  kind: '内核 · 调度',
  zh: '决定"下一个运行谁"：把 CPU 时间公平地分给每个进程。',
  desc: `
    <p>单核 CPU 一次只能跑一个进程，但系统里躺着成百上千个。调度器（scheduler）负责回答一个问题：<b>下一个该跑谁？</b></p>
    <p>Linux 的调度器叫 <b>CFS（完全公平调度器）</b>，核心思想是维护一棵红黑树，按"虚拟运行时间"排序：</p>
    <ul>
      <li>每个进程有一个 <code>vruntime</code>，跑得越久它越大。</li>
      <li>调度器总是挑 <b>vruntime 最小</b> 的进程运行（红黑树最左节点）。</li>
      <li>新进程/唤醒进程获得 <b>vruntime 补偿</b>（被减去一部分），保证它们能很快被调度到。</li>
    </ul>
    <p>触发调度的时机：进程主动让出（sleep、等待 I/O）、时间片耗尽（时钟中断）、进程被唤醒（更高优先级抢占）。切换过程叫 <b>上下文切换</b>：保存当前进程的寄存器、页表、内核栈，载入下一个进程的。</p>`,
  source: {
    file: 'kernel/sched/core.c',
    note: '__schedule 是调度的主函数：选下一个进程 → 上下文切换。',
    code: `/* kernel/sched/core.c —— 调度的核心（节选） */

static void __sched notrace __schedule(bool preempt)
{
	struct task_struct *prev, *next;
	...
	prev = rq->curr;                 /* 当前正在运行的进程 */
	...
	next = pick_next_task(rq, prev, &rf);  /* 红黑树里挑 vruntime 最小的 */
	...
	if (likely(prev != next)) {
		...
		context_switch(rq, prev, next);    /* 切换！解锁 rq */
		...
	}
	...
}

/* 挑选下一个任务的入口（内核 5.x 起用 pick_next_task_fair 等按调度类分发） */
static inline struct task_struct *
pick_next_task(struct rq *rq, struct task_struct *prev, struct rq_flags *rf)
{
	...
	return pick_next_task_fair(rq, prev, rf);   /* CFS 调度类 */
	...
}`
  },
  idea: `<p>CFS 的优雅在于：用一棵红黑树 + 一个"虚拟时钟"就把"公平"定义清楚了——不是轮流数数，而是让每个进程的 vruntime 尽量齐头并进。学习调度器，先理解"公平 = vruntime 拉平"。</p>`,
  related: ['proc-model', 'proc-life', 'proc-ctx']
};

N['k-mm'] = {
  id: 'k-mm', type: 'kernel', name: 'memory mgmt', en: '内存管理',
  kind: '内核 · 内存',
  zh: '虚拟内存的总管：页表、缺页、回收、分配。',
  desc: `
    <p>内存管理（mm）是内核最复杂的子系统，管四件事：</p>
    <ul>
      <li><b>分配</b> — 伙伴分配器（按 2 的幂分配页）给内核和用户页；slab 分配器给内核小对象。</li>
      <li><b>映射</b> — 维护每个进程的页表：虚拟地址 → 物理页框。</li>
      <li><b>缺页</b> — 进程访问未映射的页时触发缺页异常，内核按需建立映射（懒分配、按需换入）。</li>
      <li><b>回收</b> — 内存吃紧时，把干净页丢弃、脏页写回、匿名页换到 swap。</li>
    </ul>
    <p>内存管理的单位是 <b>页（4KB）</b>，它同时是虚拟内存和物理内存的最小分配单位。</p>`,
  source: {
    file: 'mm/memory.c',
    note: 'handle_mm_fault 是缺页处理的入口：逐级建立页表项。',
    code: `/* mm/memory.c —— 缺页处理（节选） */

vm_fault_t handle_mm_fault(struct vm_area_struct *vma, unsigned long address,
			   unsigned int flags)
{
	struct mm_struct *mm = vma->vm_mm;
	...
	/* 一级一级建立页表：pgd → p4d → pud → pmd → pte */
	vmf.p4d = p4d_alloc(mm, vmf.pgd, address);
	if (!vmf.p4d)
		return VM_FAULT_OOM;
	...
	vmf.pud = pud_alloc(mm, vmf.p4d, address);
	...
	vmf.pmd = pmd_alloc(mm, vmf.pud, address);
	...
	return handle_pte_fault(&vmf);   /* 最后处理真正的 PTE */
}

/* 懒分配：malloc 时只记账，真正写才分配物理页 */
/* 所以 malloc(1GB) 秒回，但逐个触碰时内存才真正被吃掉 */`
  },
  idea: `<p>虚拟内存的妙处：malloc 只是"画饼"（改 mm_struct 记账），缺页才"烙饼"（分配物理页）。这让进程可以声明巨大的地址空间，实际用多少占多少——也为"写时复制、共享库、swap"铺了路。</p>`,
  related: ['mem-virt', 'mem-page', 'mem-fault', 'hw-ram']
};

N['k-vfs'] = {
  id: 'k-vfs', type: 'kernel', name: 'VFS', en: '虚拟文件系统',
  kind: '内核 · 文件',
  zh: '文件系统的"统一接口层"：让 ext4、XFS、NFS 长成一个样。',
  desc: `
    <p><b>VFS（Virtual File System）</b> 是内核里的"文件系统抽象层"：用户看到的所有文件操作（open/read/write/stat）都先到 VFS，再由 VFS 分发到具体文件系统的实现。</p>
    <p>VFS 定义了几个核心对象：</p>
    <ul>
      <li><b>super_block</b> — 一个已挂载的文件系统实例</li>
      <li><b>inode</b> — 一个文件/目录的元数据（权限、大小、位置）</li>
      <li><b>dentry</b> — 一个路径分量（目录项缓存）</li>
      <li><b>file</b> — 一个已打开的文件（进程视角，含读写位置）</li>
    </ul>
    <p>正因有 VFS，才能"挂载"各种文件系统：ext4、XFS、Btrfs、NFS、tmpfs、proc……对用户来说都是同一个 read()。</p>`,
  source: {
    file: 'fs/read_write.c',
    note: 'vfs_read 是 read() 系统调用的通用入口：先权限检查，再分发到具体文件系统。',
    code: `/* fs/read_write.c —— VFS 读入口（节选） */

ssize_t vfs_read(struct file *file, char __user *buf, size_t count, loff_t *pos)
{
	ssize_t ret;
	...
	if (!(file->f_mode & FMODE_READ))
		return -EBADF;
	...
	ret = rw_verify_area(READ, file, pos, count);   /* 权限/边界检查 */
	...
	if (file->f_op->read)                       /* 具体文件系统提供 read */
		ret = file->f_op->read(file, buf, count, pos);
	else
		ret = new_sync_read(file, buf, count, pos);
	...
	return ret;
}

/* 具体文件系统实现的样子：file_operations 是一张"函数表" */
static const struct file_operations ext4_file_operations = {
	.read_iter	= ext4_file_read_iter,
	.write_iter	= ext4_file_write_iter,
	.mmap		= ext4_file_mmap,
	...
};`
  },
  idea: `<p>VFS 是"面向接口编程"的教科书：上层用户态只认识 read()，下层驱动只认函数表。加一个新文件系统 = 填一张 file_operations 表。这就是"一切皆文件"能成立的技术底座。</p>`,
  related: ['fs-root', 'fs-dev', 'fs-proc', 'sc-read']
};

N['k-net'] = {
  id: 'k-net', type: 'kernel', name: 'networking', en: '网络协议栈',
  kind: '内核 · 网络',
  zh: 'TCP/IP 协议栈：socket 背后的千层套路。',
  desc: `
    <p>网络协议栈实现了从 <code>socket()</code> 到网卡驱动的整条链路：</p>
    <ul>
      <li><b>socket 层</b> — 用户态看到的就是它（socket/fd）</li>
      <li><b>传输层</b> — TCP（可靠、有序、拥塞控制）/ UDP（快、不可靠）</li>
      <li><b>网络层</b> — IP 路由、分片、ICMP</li>
      <li><b>链路层</b> — 以太网帧、ARP</li>
      <li><b>驱动层</b> — 网卡收发包</li>
    </ul>
    <p>一次 <code>send()</code>：数据从用户缓冲区拷进内核 → TCP 分段、加头部 → IP 封装 → 邻居子系统查 MAC → 驱动把 skb 送上网卡。收包则是反向的中断驱动流程（NAPI）。</p>
    <p>内核里网络数据的最小单元叫 <b>sk_buff（skb）</b>——协议栈每层都在它头上/尾上加自己的头部。</p>`,
  source: {
    file: 'include/linux/skbuff.h',
    note: 'struct sk_buff：网络数据的"集装箱"，在协议栈各层间传递。',
    code: `/* include/linux/skbuff.h —— sk_buff（节选） */

struct sk_buff {
	union {
		struct {
			/* 各协议层头部指针，随层下钻而移动 */
			struct sk_buff		*next;
			struct sk_buff		*prev;
			...
		};
		...
	};
	unsigned int		len;		/* 数据总长度 */
	...
	__u16			data;		/* 数据区起点 */
	...
	struct sock		*sk;		/* 所属 socket */
	...
	/* 数据真正存在 skb->head 与 skb->end 之间的缓冲区里 */
};

/* TCP 发送路径（简化）：
 * send() → tcp_sendmsg() → tcp_write_xmit() → ip_queue_xmit()
 *        → dev_queue_xmit() → 网卡驱动 */`
  },
  idea: `<p>网络是"分层"思想的极致：每一层只处理自己的头部，把复杂问题切成小问题。skb 的指针在层间下钻（data 指针不断后移），数据不拷贝、只改指针——性能的关键。</p>`,
  related: ['hw-cpu', 'sc-read']
};

N['k-drivers'] = {
  id: 'k-drivers', type: 'kernel', name: 'drivers', en: '设备驱动',
  kind: '内核 · 驱动',
  zh: '内核与硬件的"翻译官"：把千奇百怪的硬件统一成 file_operations。',
  desc: `
    <p>驱动是内核里最庞大、最"接地气"的部分（占内核源码一半以上）。它的任务：把某个具体硬件的能力，翻译成内核统一的接口。</p>
    <p>Linux 驱动模型三件套：</p>
    <ul>
      <li><b>bus</b>（总线）— PCI、USB、platform… 描述硬件挂在哪</li>
      <li><b>device</b>（设备）— 硬件实体</li>
      <li><b>driver</b>（驱动）— 处理设备的代码；通过 <b>匹配表</b> 与设备结对</li>
    </ul>
    <p>驱动运行在 <b>内核态（ring 0）</b>：可以执行特权指令、直接访问 I/O 端口、操作 DMA。这也是为什么驱动出 bug 会直接内核崩溃（oops/panic）——它和内核没有隔离。</p>`,
  source: {
    file: 'drivers/（以 platform 驱动为例）',
    note: '现代驱动用 device/driver/bus 模型注册，probe() 在设备匹配时被调用。',
    code: `/* drivers/xxx/xxx.c —— 一个 platform 驱动的骨架（节选） */

static const struct of_device_id xxx_of_match[] = {
	{ .compatible = "vendor,my-chip", },
	{ }
};
MODULE_DEVICE_TABLE(of, xxx_of_match);

static int xxx_probe(struct platform_device *pdev)
{
	/* 设备被识别后调用：申请资源、注册中断、创建设备文件 */
	int irq = platform_get_irq(pdev, 0);
	...
	devm_request_irq(&pdev->dev, irq, xxx_isr, 0, "xxx", dev);
	...
	device_create(xxx_class, &pdev->dev, MKDEV(xxx_major, 0), NULL, "xxx");
	return 0;
}

static struct platform_driver xxx_driver = {
	.probe	= xxx_probe,
	.driver	= {
		.name	= "xxx",
		.of_match_table = xxx_of_match,
	},
};
module_platform_driver(xxx_driver);   /* 注册到 platform 总线 */`
  },
  idea: `<p>驱动模型把"谁负责哪个硬件"变成数据驱动的匹配：设备树/ACPI 描述硬件，驱动声明"我能处理什么"，内核按兼容性配对。插上新硬件 → 匹配 → probe() → 设备可用，全自动。</p>`,
  related: ['fs-dev', 'fs-sys', 'k-vfs']
};

N['k-ipc'] = {
  id: 'k-ipc', type: 'kernel', name: 'IPC', en: '进程间通信',
  kind: '内核 · 通信',
  zh: '进程间通信：管道、信号、共享内存、socket。',
  desc: `
    <p>进程彼此隔离（各有地址空间），但系统需要它们协作。内核提供多种 IPC 手段：</p>
    <ul>
      <li><b>管道 pipe</b> — 字节流，一端写一端读（<code>a | b</code> 就是它）</li>
      <li><b>信号 signal</b> — 异步通知（Ctrl+C 发 SIGINT，段错误发 SIGSEGV）</li>
      <li><b>共享内存 shm</b> — 同一块物理页映射到多个进程，最快</li>
      <li><b>消息队列 / 信号量</b> — System V 传统 IPC</li>
      <li><b>UNIX socket</b> — 本机进程间的 socket 通信</li>
    </ul>
    <p>管道的数据在<b>内核缓冲区</b>里中转：写端 <code>write()</code> 进管道缓冲，读端 <code>read()</code> 取走。管道容量有限（64KB），写满时写进程会被阻塞（睡眠）。</p>`,
  source: {
    file: 'fs/pipe.c',
    note: 'pipe 的内核实现：一个环形缓冲区 + 两个 file 结构（一头读一头写）。',
    code: `/* fs/pipe.c —— 管道（节选） */

struct pipe_inode_info {
	...
	struct pipe_buffer *bufs;      /* 环形缓冲 */
	unsigned int nrbufs;           /* 当前有多少段 */
	unsigned int curbuf;
	...
	wait_queue_head_t rd_wait;     /* 读者等待队列 */
	wait_queue_head_t wr_wait;     /* 写者等待队列 */
	...
};

/* 写端满了就睡眠，等读者取走数据 */
static inline void pipe_wait_writable(struct pipe_inode_info *pipe)
{
	...
	wait_event_interruptible(pipe->wr_wait,
				 pipe_writable(pipe) || ...);
}

/* shell 里的 a | b：a 的 stdout 和 b 的 stdin 指向同一根管道 */`
  },
  idea: `<p>管道是最能体现"文件抽象"威力的设计：两个进程只见自己的 fd，一个写一个读，中间的缓冲、阻塞、唤醒全由内核悄悄完成。学完管道，就理解了"进程间协作 = 内核做中介"。</p>`,
  related: ['proc-model', 'sc-read']
};

/* ==========================================================================
   四、系统调用
   ========================================================================== */

N['sc-overview'] = {
  id: 'sc-overview', type: 'syscall', name: 'syscall', en: '系统调用',
  kind: '系统调用',
  zh: '用户态进入内核态的唯一合法通道。',
  desc: `
    <p>用户态程序不能直接碰硬件、改页表、杀别人进程。想干这些，只能<b>请求内核代办</b>——这个"请求"就是系统调用。</p>
    <p>一次系统调用的完整旅程（以 x86-64 为例）：</p>
    <div class="flow">
      <span class="flow-step">用户态</span><span class="flow-arrow">→</span>
      <span class="flow-step">libc 封装 read()</span><span class="flow-arrow">→</span>
      <span class="flow-step hot">syscall 指令</span><span class="flow-arrow">→</span>
      <span class="flow-step hot">CPU 切到 ring 0</span><span class="flow-arrow">→</span>
      <span class="flow-step hot">entry_SYSCALL_64</span><span class="flow-arrow">→</span>
      <span class="flow-step hot">do_syscall_64</span><span class="flow-arrow">→</span>
      <span class="flow-step hot">sys_read</span><span class="flow-arrow">→</span>
      <span class="flow-step">返回用户态</span>
    </div>
    <ul>
      <li>用户代码把<b>系统调用号</b>放 rax，参数放 rdi/rsi/rdx…，执行 <code>syscall</code> 指令。</li>
      <li>CPU 硬件自动：切到 ring 0、保存用户寄存器、跳到 MSR LSTAR 指向的入口。</li>
      <li>内核入口保存现场，用 rax 查 <b>系统调用表</b>，调用对应内核函数。</li>
      <li>内核函数干完活，返回；内核恢复用户现场，执行 <code>sysret</code> 回用户态。</li>
    </ul>`,
  source: {
    file: 'arch/x86/entry/common.c',
    note: 'do_syscall_64：按系统调用号查表调用。regs->ax 保存返回值。',
    code: `/* arch/x86/entry/common.c —— 系统调用分发（节选） */

__visible void do_syscall_64(unsigned long nr, struct pt_regs *regs)
{
	struct thread_info *ti;

	...
	/* 边界检查 + 防 Spectre 的数组下标修正 */
	if (likely(nr < NR_syscalls)) {
		nr = array_index_nospec(nr, NR_syscalls);
		regs->ax = sys_call_table[nr](regs);   /* 查表调用 */
	}
	...
}
/* sys_call_table 就是 syscall_64.tbl 生成的函数指针数组 */

/* 入口汇编（arch/x86/entry/entry_64.S，节选） */
SYM_CODE_START(entry_SYSCALL_64)
	swapgs
	...
	movq	%rsp, PER_CPU_VAR(cpu_tss_rw + TSS_sp2)
	...
	call	do_syscall_64      /* 进入 C 代码 */
	...
SYM_CODE_END(entry_SYSCALL_64)`
  },
  idea: `<p>系统调用是"内核/用户"分界的海关：所有特权操作必须报关。这套机制保证了用户态永远无法绕过内核搞破坏——即使程序写满 bug，最坏也只是自己崩，动不了别人。</p>`,
  related: ['sc-read', 'hw-cpu', 'proc-model']
};

N['sc-read'] = {
  id: 'sc-read', type: 'syscall', name: 'read()', en: '一次系统调用的解剖',
  kind: '系统调用 · 实例',
  zh: '以 read() 为例，走完从用户态到磁盘的完整链路。',
  desc: `
    <p>拿 <code>read(fd, buf, 100)</code> 举例——程序从文件读 100 字节，内核里发生了什么：</p>
    <div class="flow">
      <span class="flow-step">read()</span><span class="flow-arrow">→</span>
      <span class="flow-step">syscall 进内核</span><span class="flow-arrow">→</span>
      <span class="flow-step">ksys_read</span><span class="flow-arrow">→</span>
      <span class="flow-step">vfs_read</span><span class="flow-arrow">→</span>
      <span class="flow-step">ext4_file_read_iter</span><span class="flow-arrow">→</span>
      <span class="flow-step">页缓存</span><span class="flow-arrow">→</span>
      <span class="flow-step">缺页/块设备</span><span class="flow-arrow">→</span>
      <span class="flow-step">copy_to_user 返回</span>
    </div>
    <ul>
      <li><b>fd → file</b>：进程的 <code>files_struct</code> 按 fd 找到 <code>struct file</code>。</li>
      <li><b>vfs_read</b>：权限检查 + 分发到文件系统。</li>
      <li><b>页缓存</b>：要读的页若已在缓存，直接命中；否则从磁盘读入（触发真实 I/O）。</li>
      <li><b>copy_to_user</b>：把内核缓冲区的数据拷贝到用户缓冲区，检查目的地址合法性。</li>
    </ul>
    <p>注意：<b>read() 可能"没读到"</b>（返回 0 = EOF，返回 -1 = 出错）。所以标准写法是循环读取，处理部分读。</p>`,
  source: {
    file: 'fs/read_write.c',
    note: 'ksys_read → vfs_read 的完整调用（精简）。',
    code: `/* fs/read_write.c —— read 系统调用的实现（节选） */

SYSCALL_DEFINE3(read, unsigned int, fd, char __user *, buf, size_t, count)
{
	return ksys_read(fd, buf, count);
}

ssize_t ksys_read(unsigned int fd, char __user *buf, size_t count)
{
	struct fd f = fdget_pos(fd);
	ssize_t ret = -EBADF;

	if (f.file) {
		loff_t pos = file_pos_read(f.file);
		ret = vfs_read(f.file, buf, count, &pos);   /* VFS 入口 */
		file_pos_write(f.file, pos);
		fdput_pos(f);
	}
	return ret;
}

/* 用户态怎么用（C 语言） */
#include <unistd.h>
char buf[100];
ssize_t n = read(0, buf, sizeof buf);   /* 从标准输入读 */
/* 返回 n > 0: 实际读到的字节数
 * 返回 n == 0: EOF（文件读完）
 * 返回 n < 0: 出错（errno）*/`
  },
  idea: `<p>一个 read() 是整门操作系统的缩影：fd 表、VFS、页缓存、块设备、copy_to_user，全串起来了。把这条链路走通，Linux 的骨架就装进脑子里了。</p>`,
  related: ['k-vfs', 'k-mm', 'sc-overview', 'hw-disk']
};

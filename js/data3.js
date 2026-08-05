/* ==========================================================================
   KDATA — 内容数据（第三部分：文件数据流链路 + 中断 + libc）
   这些模块补齐了"数据流"的关键环节，让架构图真正连成一条链：
   进程 → libc → 系统调用 → VFS → ext4 → 页缓存/块层 → 磁盘
   以及：时钟中断 → 调度器 → 进程切换
   ========================================================================== */

const N3 = window.KDATA.nodes;

/* ---------- glibc：用户态与系统调用之间的"翻译层" ---------- */
N3['k-libc'] = {
  id: 'k-libc', type: 'user', name: 'libc', en: 'glibc · 用户态库',
  kind: '用户 · 库',
  zh: '把系统调用包装成普通函数：printf、read、malloc 的"幕后"。',
  desc: `
    <p>你的 C 程序调用的 <code>printf()</code>、<code>read()</code>、<code>malloc()</code>，真正干活的是 <b>glibc</b>（GNU C 库）。它是用户态最底层的库，直接面对系统调用。</p>
    <p>libc 做的事：</p>
    <ul>
      <li><b>系统调用封装</b> — 把参数整理好、执行 syscall 指令、把内核返回值转成 errno</li>
      <li><b>缓冲</b> — printf 先写进用户态缓冲区，攒够才一次性 write（减少系统调用次数）</li>
      <li><b>malloc 实现</b> — 小内存用 brk 扩展堆，大内存用 mmap，还维护空闲链表</li>
      <li><b>启动代码</b> — 程序入口其实是 _start，它初始化 libc 再调用 main()</li>
    </ul>
    <p>系统调用很贵（每次要切内核态），所以 libc 用"缓冲 + 批量"来减少调用次数——这就是为什么 <code>printf</code> 不带 <code>\\n</code> 可能不立即输出的原因。</p>`,
  source: {
    file: 'glibc: sysdeps/unix/sysv/linux/read.c',
    note: 'read() 的 glibc 封装：内部直接执行系统调用。',
    code: `/* glibc: sysdeps/unix/sysv/linux/read.c */
/* 用户态程序调 read()，最终在这里变成一条 syscall 指令 */

ssize_t
__read (int fd, void *buf, size_t nbytes)
{
  return SYSCALL_CANCEL (read, fd, buf, nbytes);
}
weak_alias (__read, read)

/* SYSCALL_CANCEL 展开后大致是：
 *   long ret = syscall(SYS_read, fd, buf, nbytes);  // 进入内核
 *   if (ret < 0) { errno = -ret; return -1; }       // 错误转 errno
 *   return ret;                                      // 成功返回字节数
 */

/* malloc 的两种底牌（glibc malloc.c）：
 *   小块：brk() 扩展堆顶（main_arena 空闲链表）
 *   大块：mmap() 直接映射匿名页（> MMAP_THRESHOLD 128KB）*/`
  },
  idea: `<p>libc 是"系统调用的减速带"：内核切换很贵，所以 libc 把多次小请求攒成一次大请求。理解 libc ↔ 内核的这层关系，就理解了为什么程序员要关心缓冲、为什么 read/write 与 printf 的行为不同。</p>`,
  related: ['proc-model', 'proc-exec', 'sc-overview', 'sc-read']
};

/* ---------- page cache：文件数据流的中转站 ---------- */
N3['k-pagecache'] = {
  id: 'k-pagecache', type: 'kernel', name: 'page cache', en: '页缓存',
  kind: '内核 · 文件',
  zh: '读过的文件页留在内存里：内存是磁盘的"高速缓存"。',
  desc: `
    <p><b>页缓存（page cache）</b>是内核里最重要的性能设施：它把磁盘文件的内容缓存成内存页。</p>
    <p>读文件的数据流：</p>
    <div class="flow">
      <span class="flow-step">read()</span><span class="flow-arrow">→</span>
      <span class="flow-step">VFS</span><span class="flow-arrow">→</span>
      <span class="flow-step">ext4</span><span class="flow-arrow">→</span>
      <span class="flow-step hot">页缓存命中？</span><span class="flow-arrow">→</span>
      <span class="flow-step">命中：直接返回</span>
      <span class="flow-arrow">/</span>
      <span class="flow-step">未命中：从磁盘读入</span>
    </div>
    <ul>
      <li><b>命中</b> — 页已在缓存，直接把数据拷给用户，不碰磁盘（纳秒级）</li>
      <li><b>未命中</b> — 分配页 → 发起块 I/O 读磁盘 → 填入缓存 → 返回（毫秒级）</li>
    </ul>
    <p>缓存页的状态：<b>干净</b>（与磁盘一致，可随时丢弃）和<b>脏</b>（被改过，需写回磁盘）。内核后台线程 pdflush/写回机制定期把脏页刷盘。</p>`,
  source: {
    file: 'mm/filemap.c',
    note: '页缓存的核心操作：把页加入缓存链表。do_generic_file_read 是读路径主函数。',
    code: `/* mm/filemap.c —— 页缓存（节选） */

/* 把新读入的页加入页缓存 + LRU 链表 */
static inline int add_to_page_cache_lru(struct page *page,
		struct address_space *mapping, pgoff_t offset, gfp_t gfp_mask)
{
	int ret;

	ret = __add_to_page_cache_locked(page, mapping, offset, gfp_mask);
	if (ret == 0)
		lru_cache_add(page);          /* 进 LRU，供回收 */
	return ret;
}

/* 读文件的主路径：先查缓存，未命中才 readpage 调磁盘 */
static ssize_t do_generic_file_read(struct kiocb *iocb, struct iov_iter *iter)
{
	...
	/* 查找/读取每一页 */
	page = find_get_page(mapping, index);       /* 查页缓存 */
	if (!page) {
		page = page_cache_alloc_cold(mapping);
		...
		error = mapping->a_ops->readpage(file, page);  /* 从磁盘读 */
		...
	}
	...
}

/* 内存不够时，干净缓存页直接被丢弃（free），脏页先写回 */
/* free 命令里的 buff/cache 就是它 —— 可回收，不是浪费 */`
  },
  idea: `<p>页缓存是"用内存换时间"的极致：一次磁盘读（毫秒）换来无数次缓存命中（纳秒）。读文件快不快，几乎全看命中率——这也是预读（readahead）和脏页写回策略存在的意义。</p>`,
  related: ['k-mm', 'k-vfs', 'k-ext4', 'k-block', 'hw-disk', 'mem-swap', 'mem-fault']
};

/* ---------- ext4：具体的文件系统实现 ---------- */
N3['k-ext4'] = {
  id: 'k-ext4', type: 'kernel', name: 'ext4', en: '具体文件系统',
  kind: '内核 · 文件',
  zh: 'VFS 之下真正干活的文件系统：把"文件"变成磁盘上的 inode 和数据块。',
  desc: `
    <p>VFS 是接口，<b>ext4</b> 是接口的实现——最常见的 Linux 根文件系统。它负责把"文件"这个抽象落实成磁盘布局：</p>
    <ul>
      <li><b>inode</b> — 每个文件一个：权限、大小、时间戳、数据块位置（extent 树）</li>
      <li><b>目录</b> — 目录项（dentry）→ inode 号 的映射</li>
      <li><b>数据块分配</b> — 用 <b>extent（区段）</b>记录连续块，减少碎片、加快大文件访问</li>
      <li><b>日志（journal）</b> — 先写日志再改数据，崩溃后能恢复一致性</li>
    </ul>
    <p>用户态看到的 <code>open/read/write/stat</code> 经过 VFS 分发后，最终由 ext4 的 <code>file_operations</code> 执行。比如 <code>read</code> 走 <code>ext4_file_read_iter</code>，底层再借用页缓存机制。</p>`,
  source: {
    file: 'fs/ext4/file.c',
    note: 'ext4 文件操作实现：读路径直接复用通用页缓存读。',
    code: `/* fs/ext4/file.c —— ext4 的读实现（节选） */

static ssize_t ext4_file_read_iter(struct kiocb *iocb, struct iov_iter *to)
{
	struct inode *inode = file_inode(iocb->ki_filp);
	...
	if (unlikely(ext4_forced_shutdown(EXT4_SB(inode->i_sb))))
		return -EIO;

	/* 通用读路径：走页缓存 */
	return generic_file_read_iter(iocb, to);
}

/* ext4 注册给 VFS 的函数表 */
const struct file_operations ext4_file_operations = {
	.llseek		= ext4_llseek,
	.read_iter	= ext4_file_read_iter,    /* ← read() 最终到这里 */
	.write_iter	= ext4_file_write_iter,
	.mmap		= ext4_file_mmap,
	...
};

/* inode 的 extent 树：记录文件数据在磁盘上的位置 */
struct ext4_extent {
	__le32	ee_block;	/* 逻辑块号 */
	__le16	ee_len;		/* 长度（连续块数） */
	__le16	ee_start_hi;	/* 物理起始块（高16位） */
	__le32	ee_start_lo;	/* 物理起始块（低32位） */
};`
  },
  idea: `<p>ext4 展示了"抽象与实现"的分层：VFS 定义接口，ext4 处理磁盘细节（extent、日志、块分配）。换一个文件系统（XFS/Btrfs）对用户完全透明——这就是"面向接口编程"在系统级的应用。</p>`,
  related: ['k-vfs', 'k-block', 'k-pagecache', 'fs-root']
};

/* ---------- block layer：文件系统与磁盘之间的调度中枢 ---------- */
N3['k-block'] = {
  id: 'k-block', type: 'kernel', name: 'block layer', en: '块设备层',
  kind: '内核 · 块设备',
  zh: 'I/O 请求的调度中枢：把散乱的小请求合并成大块，喂给磁盘。',
  desc: `
    <p>文件系统算出"数据在磁盘哪块"，然后打包成 <b>bio</b>（块 I/O 请求）交给 <b>块设备层（block layer）</b>。块层的职责：</p>
    <ul>
      <li><b>合并（merge）</b> — 相邻的请求合成一个大请求（一次寻道干更多活）</li>
      <li><b>调度（scheduling）</b> — 按电梯算法/多队列（blk-mq）优化磁盘寻道顺序</li>
      <li><b>分发</b> — 把请求交给具体设备驱动（NVMe/SCSI/AHCI）</li>
    </ul>
    <p>一个 <code>read()</code> 到这里的形态：文件系统定位到磁盘块号 → 构造 bio（含页缓存目标页、块号、长度）→ <code>submit_bio()</code> → 驱动把命令发给磁盘控制器 → 磁盘 DMA 把数据直接写进内存页 → 完成中断通知内核。</p>`,
  source: {
    file: 'block/blk-core.c',
    note: 'submit_bio 是块 I/O 提交的统一入口。',
    code: `/* block/blk-core.c —— 块 I/O 提交（节选） */

/**
 * submit_bio - 提交一个 bio 给块层处理
 * @bio: 要提交的 I/O 请求
 */
blk_qc_t submit_bio(struct bio *bio)
{
	...
	/* 现代内核走多队列路径：按 CPU 放入硬件队列 */
	return blk_mq_submit_bio(bio);
}

/* bio 的样子：一次 I/O 的完整描述 */
struct bio {
	struct block_device	*bi_bdev;	/* 目标设备 */
	unsigned int		bi_opf;		/* 读/写/刷新等操作 */
	...
	struct bio_vec		*bi_io_vec;	/* 要读写哪些内存页 */
	unsigned short		bi_vcnt;	/* 页段数量 */
	...
};

/* 一个读请求的生命周期：
 * ext4 → submit_bio() → blk_mq_submit_bio() → 硬件队列
 *      → NVMe 驱动写 SQ 门铃 → 磁盘 DMA 到内存 → 完成中断 */
`
  },
  idea: `<p>块层是"性能调度的最后一道闸门"：磁盘最怕乱序寻道，块层把所有 I/O 排队合并，让磁盘尽量顺序读写。理解块层，就理解了为什么"小文件多"会让系统变慢——合并机会少了。</p>`,
  related: ['k-ext4', 'k-pagecache', 'hw-disk', 'k-drivers']
};

/* ---------- interrupts：硬件与内核的"敲门砖" ---------- */
N3['k-irq'] = {
  id: 'k-irq', type: 'kernel', name: 'interrupts', en: '中断处理',
  kind: '内核 · 中断',
  zh: '硬件事件打断 CPU：时钟、键盘、网卡、磁盘完成——一切异步的来源。',
  desc: `
    <p><b>中断（interrupt）</b>是硬件主动通知 CPU 的机制：设备有事了，就拉一条中断线，CPU 停下当前工作，跳到内核的中断处理程序。</p>
    <p>Linux 的中断体系：</p>
    <ul>
      <li><b>中断控制器（APIC）</b> — 汇集各设备的中断线，按优先级送给 CPU</li>
      <li><b>IDT（中断描述符表）</b> — CPU 查表跳转到对应处理函数</li>
      <li><b>上半部/下半部</b> — 紧急的在上半部做（关中断，快进快出），重活推迟到下半部（softirq/tasklet/workqueue）</li>
    </ul>
    <p>对学习最相关的是 <b>时钟中断</b>：硬件定时器周期性打断 CPU（如 1000Hz），内核在中断里检查当前进程时间片是否用完——<b>这是调度器能"抢"进程的物理基础</b>。没有中断，进程可以赖在 CPU 上永远不撒手。</p>`,
  source: {
    file: 'kernel/irq/handle.c',
    note: '中断事件分发：handle_irq_event 调用注册的 handler。',
    code: `/* kernel/irq/handle.c —— 中断事件处理（节选） */

irqreturn_t handle_irq_event(struct irq_desc *desc)
{
	irqreturn_t ret;

	...
	ret = handle_irq_event_percpu(desc);   /* 逐个调用设备 handler */
	...
	return ret;
}

/* 时钟中断的典型流程（x86, arch/x86/kernel/irq.c）：
 *  APIC 定时器中断 → do_timer_interrupt_hook()
 *    → tick_periodic() 更新 jiffies
 *    → scheduler_tick() 检查时间片
 *    → 若需要则设置 NEED_RESCHED → 中断返回时调度 */

/* 中断 vs 系统调用 vs 异常 —— 三种进入内核的通道：
 *  系统调用：程序主动请求（syscall 指令）
 *  异常：程序出错（缺页、除零）——同步
 *  中断：设备通知（时钟、网卡）——异步，随时可能来 */
`
  },
  idea: `<p>中断是操作系统的"心跳"：它让 CPU 不再傻等，而是被事件驱动。理解中断 = 理解抢占式调度的物理来源 + 理解为什么内核代码要关中断保护临界区（数据一致性）。</p>`,
  related: ['k-sched', 'hw-cpu', 'k-drivers', 'proc-ctx', 'hw-disk']
};

/* ==========================================================================
   数据流路径（path）：点击节点时，光点沿此路径流动演示
   ========================================================================== */

window.KDATA.nodes['sc-read'].path =
  ['proc-model', 'sc-overview', 'k-vfs', 'k-ext4', 'k-pagecache', 'k-block', 'hw-disk'];

window.KDATA.nodes['sc-overview'].path =
  ['proc-model', 'sc-overview', 'k-vfs'];

window.KDATA.nodes['mem-fault'].path =
  ['proc-addr', 'mem-page', 'mem-fault', 'mem-virt'];

window.KDATA.nodes['k-init'].path =
  ['hw-cpu', 'k-init', 'k-sched', 'k-mm', 'k-vfs', 'proc-model'];

window.KDATA.nodes['proc-exec'].path =
  ['proc-model', 'proc-exec', 'k-libc'];

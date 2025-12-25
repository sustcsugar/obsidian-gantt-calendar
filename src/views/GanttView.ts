import { BaseCalendarRenderer } from './BaseCalendarRenderer';
import type { GanttTask, GanttTimeGranularity } from '../types';
import { formatDate, getTodayDate } from '../dateUtils/dateUtilsIndex';

/**
 * 甘特图视图渲染器
 */
export class GanttViewRenderer extends BaseCalendarRenderer {
  private startField: 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate' = 'startDate';
  private endField: 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate' = 'dueDate';
  private statusFilter: 'all' | 'completed' | 'uncompleted' = 'uncompleted';
  private timeGranularity: GanttTimeGranularity = 'day'; // 默认时间颗粒度为日
  private readonly VISIBLE_UNITS = 50; // 可见时间单位数量（固定显示30个格子）

  // 滚动与刻度同步所需引用
  private timelineScrollEl: HTMLElement | null = null;
  private bodyScrollEl: HTMLElement | null = null;
  private timelineStart: Date | null = null;
  private totalUnits = 0;
  private todayLineEl: HTMLElement | null = null;
  private todayOffsetUnits: number | null = null;
  private cachedUnitWidth: number | null = null;
  private isScrolling = false; // 防止重复触发滚动事件

  public getStartField() { return this.startField; }
  public setStartField(v: any) { this.startField = v; }
  public getEndField() { return this.endField; }
  public setEndField(v: any) { this.endField = v; }
  public getStatusFilter() { return this.statusFilter; }
  public setStatusFilter(v: 'all' | 'completed' | 'uncompleted') { this.statusFilter = v; }
  public getTimeGranularity() { return this.timeGranularity; }
  public setTimeGranularity(v: GanttTimeGranularity) { this.timeGranularity = v; }

  /** 跳转到今天（横向滚动并更新今天线） */
  public jumpToToday(): void {
    if (!this.timelineStart || !this.timelineScrollEl || !this.bodyScrollEl) return;
    const offsetUnits = this.todayOffsetUnits;
    if (offsetUnits === null) return;

    const unitWidth = this.getUnitWidth();
    const targetLeft = offsetUnits * unitWidth - this.timelineScrollEl.clientWidth / 2;
    const scrollLeft = Math.max(0, targetLeft);

    // 设置滚动锁，防止重复触发
    this.isScrolling = true;
    
    this.timelineScrollEl.scrollLeft = scrollLeft;
    this.bodyScrollEl.scrollLeft = scrollLeft;
    this.setTodayLinePosition(offsetUnits, scrollLeft);
    
    // 延迟解除锁
    setTimeout(() => {
      this.isScrolling = false;
    }, 50);
  }

  render(container: HTMLElement, currentDate: Date): void {
    // 根容器
    const root = container.createDiv('calendar-gantt-view');
    // 加载并渲染
    this.loadAndRenderGantt(root);
  }

  /**
   * 根据时间颗粒度计算时间单位数量
   */
  private calculateTimeUnits(startDate: Date, endDate: Date): number {
    const diffMs = endDate.getTime() - startDate.getTime();
    
    switch (this.timeGranularity) {
      case 'day':
        return Math.ceil(diffMs / (24 * 60 * 60 * 1000)) + 1;
      case 'week':
        return Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
      case 'month':
        const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                      (endDate.getMonth() - startDate.getMonth()) + 1;
        return Math.max(1, months);
      default:
        return 30;
    }
  }

  /**
   * 格式化时间单位标签
   */
  private formatTimeUnitLabel(date: Date, index: number): string {
    switch (this.timeGranularity) {
      case 'day':
        return formatDate(date, 'yyyy-MM-dd');
      case 'week':
        const weekEnd = new Date(date);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return `${formatDate(date, 'MM-dd')} ~ ${formatDate(weekEnd, 'MM-dd')}`;
      case 'month':
        return formatDate(date, 'yyyy-MM');
      default:
        return '';
    }
  }

  /**
   * 获取下一个时间单位的日期
   */
  private getNextTimeUnit(date: Date): Date {
    const next = new Date(date);
    switch (this.timeGranularity) {
      case 'day':
        next.setDate(next.getDate() + 1);
        break;
      case 'week':
        next.setDate(next.getDate() + 7);
        break;
      case 'month':
        next.setMonth(next.getMonth() + 1);
        break;
    }
    return next;
  }

  /**
   * 计算任务在时间轴上的偏移和宽度（单位数量）
   */
  private calculateTaskPosition(
    taskStart: Date,
    taskEnd: Date,
    timelineStart: Date,
    totalUnits: number
  ): { startOffset: number; duration: number } {
    const msPerUnit = this.getMillisecondsPerUnit();
    const startOffsetMs = taskStart.getTime() - timelineStart.getTime();
    const durationMs = taskEnd.getTime() - taskStart.getTime();
    
    const startOffset = Math.max(0, startOffsetMs / msPerUnit);
    const duration = Math.max(0.5, durationMs / msPerUnit + 1);
    
    return { startOffset, duration };
  }

  /**
   * 获取每个时间单位的毫秒数
   */
  private getMillisecondsPerUnit(): number {
    switch (this.timeGranularity) {
      case 'day':
        return 24 * 60 * 60 * 1000;
      case 'week':
        return 7 * 24 * 60 * 60 * 1000;
      case 'month':
        return 30 * 24 * 60 * 60 * 1000; // 近似值
      default:
        return 24 * 60 * 60 * 1000;
    }
  }

  private getUnitWidth(): number {
    // 使用缓存值，避免重复计算
    if (this.cachedUnitWidth !== null) {
      return this.cachedUnitWidth;
    }
    
    if (this.timelineScrollEl) {
      const cell = this.timelineScrollEl.querySelector('.gantt-date-cell') as HTMLElement;
      if (cell) {
        const width = cell.getBoundingClientRect().width;
        // 加上gap的宽度（grid gap为2px）
        this.cachedUnitWidth = width + 2;
        return this.cachedUnitWidth;
      }
    }
    return 102; // 100 + 2 (gap)
  }

  private setTodayLinePosition(offsetUnits: number | null, scrollLeft?: number): void {
    if (!this.todayLineEl) return;
    if (offsetUnits === null || offsetUnits < 0 || offsetUnits > this.totalUnits) {
      this.todayLineEl.style.display = 'none';
      return;
    }
    const unitWidth = this.getUnitWidth();
    // 减去gap的偏移，因为第一个单元格前面没有gap
    const leftPx = offsetUnits * unitWidth - (scrollLeft ?? this.timelineScrollEl?.scrollLeft ?? 0);
    this.todayLineEl.style.display = 'block';
    this.todayLineEl.style.left = `${leftPx}px`;
  }


  private syncHorizontalScroll(source: HTMLElement, target: HTMLElement): void {
    source.addEventListener('scroll', () => {
      if (target.scrollLeft !== source.scrollLeft) {
        target.scrollLeft = source.scrollLeft;
      }
    });
  }

  /**
   * 初始化分割线拖动功能
   */
  private initResizer(resizer: HTMLElement, tasksSection: HTMLElement): void {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    const onMouseDown = (e: MouseEvent) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = tasksSection.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const delta = e.clientX - startX;
      const newWidth = startWidth + delta;
      
      // 限制最小和最大宽度
      const minWidth = 200;
      const maxWidth = 600;
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      tasksSection.style.flexBasis = `${clampedWidth}px`;
      tasksSection.style.width = `${clampedWidth}px`;
    };

    const onMouseUp = () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    resizer.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  private async loadAndRenderGantt(root: HTMLElement): Promise<void> {
    root.empty();
    const tasksAll: GanttTask[] = this.plugin.taskCache.getAllTasks();

    // 状态筛选
    let tasks = tasksAll;
    if (this.statusFilter === 'completed') tasks = tasks.filter(t => t.completed);
    if (this.statusFilter === 'uncompleted') tasks = tasks.filter(t => !t.completed);

    // 过滤出具备时间范围的任务
    const withRange = tasks
      .map(t => ({ t, start: (t as any)[this.startField], end: (t as any)[this.endField] }))
      .filter(x => x.start && x.end)
      .map(x => ({ task: x.t, start: new Date(x.start), end: new Date(x.end) }))
      .filter(x => !isNaN(x.start.getTime()) && !isNaN(x.end.getTime()) && x.end >= x.start);

    if (withRange.length === 0) {
      root.createEl('div', { text: '暂无可绘制的任务范围', cls: 'gantt-task-empty' });
      return;
    }

    // 计算时间范围
    const minStart = new Date(Math.min(...withRange.map(x => x.start.getTime())));
    minStart.setHours(0, 0, 0, 0);
    const maxEnd = new Date(Math.max(...withRange.map(x => x.end.getTime())));
    maxEnd.setHours(0, 0, 0, 0);
    
    // 计算总的时间单位数量
    const totalUnits = this.calculateTimeUnits(minStart, maxEnd);
    this.totalUnits = totalUnits;
    this.timelineStart = minStart;

    // 主体区域：左右分栏布局
    const body = root.createDiv('gantt-view-body');

    // 左侧：任务列表区域
    const tasksSection = body.createDiv('gantt-view-tasks');
    
    // 任务列表标题
    const tasksHeader = tasksSection.createDiv('gantt-view-tasks-header');
    tasksHeader.setText('任务卡片');
    
    // 任务卡片列表容器（grid布局）
    const taskList = tasksSection.createDiv('gantt-view-task-list');

    // 分割线：可拖动调整宽度
    const resizer = body.createDiv('gantt-view-resizer');
    this.initResizer(resizer, tasksSection);

    // 右侧：时间轴区域（可横向滚动）
    const timeSection = body.createDiv('gantt-view-time');
    
    // 时间刻度行
    const timeline = timeSection.createDiv('gantt-view-timeline');
    const timelineScroll = timeline.createDiv('gantt-timeline-scroll');
    this.timelineScrollEl = timelineScroll;
    timelineScroll.style.setProperty('--gantt-total-units', String(totalUnits));
    timelineScroll.style.setProperty('--gantt-visible-units', String(this.VISIBLE_UNITS));
    const timelineRow = timelineScroll.createDiv('gantt-timeline-row');

    let currentDate = new Date(minStart);
    for (let i = 0; i < totalUnits; i++) {
      const cell = timelineRow.createDiv('gantt-date-cell');
      cell.setText(this.formatTimeUnitLabel(currentDate, i));
      currentDate = this.getNextTimeUnit(currentDate);
    }

    // 甘特条容器（横向滚动）
    const ganttBarsWrapper = timeSection.createDiv('gantt-view-bars');
    const ganttBarsScroll = ganttBarsWrapper.createDiv('gantt-bars-scroll');
    this.bodyScrollEl = ganttBarsScroll; // 用于横向滚动同步
    
    // 设置与时间刻度相同的CSS变量
    ganttBarsScroll.style.setProperty('--gantt-total-units', String(totalUnits));
    ganttBarsScroll.style.setProperty('--gantt-visible-units', String(this.VISIBLE_UNITS));
    
    // 创建grid容器用于行对齐
    const ganttBarsGrid = ganttBarsScroll.createDiv('gantt-bars-grid');

    for (const item of withRange) {
      // 左侧：任务卡片
      const taskCard = taskList.createDiv('gantt-task-card');

      // 应用状态颜色
      this.applyStatusColors(item.task, taskCard);

      const cleaned = item.task.description;
      const gf = (this.plugin?.settings?.globalTaskFilter || '').trim();
      
      // 构建完整的任务描述用于tooltip
      let fullDescription = '';
      if (this.plugin?.settings?.showGlobalFilterInTaskText && gf) {
        fullDescription = gf + ' ';
        taskCard.appendText(gf + ' ');
      }
      fullDescription += cleaned;
      
      // 设置title属性，鼠标悬浮时显示完整描述
      taskCard.setAttr('title', fullDescription);
      
      this.renderTaskDescriptionWithLinks(taskCard, cleaned);

      taskCard.addEventListener('click', async () => {
        await this.openTaskFile(item.task);
      });

      // 右侧：甘特条行（使用与时间刻度相同的grid布局）
      const barRow = ganttBarsGrid.createDiv('gantt-bar-row');

      const { startOffset, duration } = this.calculateTaskPosition(
        item.start,
        item.end,
        minStart,
        totalUnits
      );

      // 使用grid单位而不是百分比
      const bar = barRow.createDiv('gantt-bar');
      bar.style.gridColumnStart = String(Math.floor(startOffset) + 1);
      bar.style.gridColumnEnd = String(Math.floor(startOffset + duration) + 1);
      bar.setAttr('title', `${formatDate(item.start, 'yyyy-MM-dd')} → ${formatDate(item.end, 'yyyy-MM-dd')}`);
      if (item.task.completed) bar.addClass('completed');

      // 应用状态颜色到甘特条
      this.applyStatusColors(item.task, bar);
    }

    // 同步时间刻度和甘特条的横向滚动
    this.syncHorizontalScroll(timelineScroll, ganttBarsScroll);
    this.syncHorizontalScroll(ganttBarsScroll, timelineScroll);

    // 同步任务列表和甘特条容器的垂直滚动
    taskList.addEventListener('scroll', () => {
      if (ganttBarsWrapper.scrollTop !== taskList.scrollTop) {
        ganttBarsWrapper.scrollTop = taskList.scrollTop;
      }
    });
    ganttBarsWrapper.addEventListener('scroll', () => {
      if (taskList.scrollTop !== ganttBarsWrapper.scrollTop) {
        taskList.scrollTop = ganttBarsWrapper.scrollTop;
      }
    });

    // 今天线：放置在时间区域内
    const overlay = timeSection.createDiv('gantt-today-overlay');
    const todayLine = overlay.createDiv('gantt-today-line');
    this.todayLineEl = todayLine;

    // 计算并记录今天的偏移
    const today = getTodayDate();
    const offsetUnits = (today.getTime() - minStart.getTime()) / this.getMillisecondsPerUnit();
    this.todayOffsetUnits = offsetUnits;
    
    // 初始化今天线位置（等待DOM完全渲染）
    setTimeout(() => {
      this.cachedUnitWidth = null; // 清除缓存，重新计算
      this.setTodayLinePosition(offsetUnits, this.timelineScrollEl?.scrollLeft ?? 0);
    }, 100);

    // 滚动时更新今天线位置（监听两个横向滚动容器）
    this.timelineScrollEl?.addEventListener('scroll', () => {
      if (this.isScrolling) return; // 如果正在跳转，忽略滚动事件
      this.setTodayLinePosition(this.todayOffsetUnits, this.timelineScrollEl?.scrollLeft);
    });
    ganttBarsScroll?.addEventListener('scroll', () => {
      if (this.isScrolling) return; // 如果正在跳转，忽略滚动事件
      this.setTodayLinePosition(this.todayOffsetUnits, ganttBarsScroll?.scrollLeft);
    });
  }
}

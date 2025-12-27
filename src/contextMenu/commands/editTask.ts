import { App, Modal, Setting, Notice } from 'obsidian';
import type { GanttTask } from '../../types';
import { updateTaskProperties } from '../../tasks/taskUpdater';
import { formatDate } from '../../dateUtils/dateUtilsIndex';


export function openEditTaskModal(
  app: App,
  task: GanttTask,
  enabledFormats: string[],
  onSuccess: () => void,
  allowEditContent?: boolean
): void {
  const modal = new EditTaskModal(app, task, enabledFormats, onSuccess, allowEditContent);
  modal.open();
}

class EditTaskModal extends Modal {
  private task: GanttTask;
  private enabledFormats: string[];
  private onSuccess: () => void;
  private allowEditContent: boolean;

  // 状态缓存
  private completed: boolean | undefined;
  private priority: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal' | undefined;
  private createdDate: Date | null | undefined;
  private startDate: Date | null | undefined;
  private scheduledDate: Date | null | undefined;
  private dueDate: Date | null | undefined;
  private cancelledDate: Date | null | undefined;
  private completionDate: Date | null | undefined;
  private content: string | undefined;

  constructor(app: App, task: GanttTask, enabledFormats: string[], onSuccess: () => void, allowEditContent?: boolean) {
    super(app);
    this.task = task;
    this.enabledFormats = enabledFormats;
    this.onSuccess = onSuccess;
    this.allowEditContent = !!allowEditContent;

    // 初始化为"未更改"状态（undefined），用户修改才记录
    this.completed = undefined;
    this.priority = undefined;
    this.createdDate = undefined;
    this.startDate = undefined;
    this.scheduledDate = undefined;
    this.dueDate = undefined;
    this.cancelledDate = undefined;
    this.completionDate = undefined;
    this.content = undefined;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('gantt-date-picker-modal');
    contentEl.createEl('h2', { text: '编辑任务' });


    // 任务描述（可选）
    if (this.allowEditContent) {
      // 保留原始描述，包括 wiki 链接和超链接等
      const originalContent = this.task.description || '';
      const descSetting = new Setting(contentEl)
        .setName('任务描述')
        .setDesc('修改任务的描述内容（不支持换行，Enter 键将转为空格）')
        .addTextArea(text => {
          text.setValue(originalContent);
          // 强制设置样式，覆盖 Obsidian 默认样式
          text.inputEl.style.minHeight = 'auto';
          text.inputEl.style.height = '60px';
          text.inputEl.style.width = '100%';
          text.inputEl.style.maxWidth = '400px';
          text.inputEl.style.resize = 'none'; // 禁止拖动调整大小
          text.inputEl.style.overflow = 'auto'; // 内容过多时显示滚动条

          // 阻止换行：Enter 键转为空格
          text.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const start = text.inputEl.selectionStart;
              const end = text.inputEl.selectionEnd;
              const value = text.inputEl.value;
              text.inputEl.value = value.slice(0, start) + ' ' + value.slice(end);
              text.inputEl.selectionStart = text.inputEl.selectionEnd = start + 1;
              this.content = text.inputEl.value;
            }
          });

          text.onChange((v) => {
            // 兜底：将任何换行符替换为空格
            this.content = v.replace(/[\r\n]+/g, ' ');
          });
        });
      // 修复描述文本区域样式
      descSetting.controlEl.style.width = '100%';
      descSetting.controlEl.style.maxWidth = '400px';
    }


    // 优先级
    new Setting(contentEl)
      .setName('优先级')
      .setDesc('选择任务优先级（留空表示不更改）')
      .addDropdown(drop => {
        drop.addOptions({
          '': '不更改',
          'highest': '🔺 最高',
          'high': '⏫ 高',
          'medium': '🔼 中',
          'low': '🔽 低',
          'lowest': '⏬ 最低',
          'normal': '清除（普通）',
        });
        drop.setValue('');
        drop.onChange(value => {
          this.priority = (value === '') ? undefined : (value as any);
        });
      });

    // 日期输入生成器
    const addDateSetting = (
      name: string,
      current: Date | undefined,
      onChange: (d: Date | null) => void
    ) => {
      const s = new Setting(contentEl).setName(name);
      let textControl: any;
      const input = s.addText(t => {
        textControl = t;
        const initStr = current ? formatDate(current, 'yyyy-MM-dd') : '';
        t.setPlaceholder('yyyy-MM-dd').setValue(initStr);
        t.inputEl.type = 'date';
        if (initStr) t.inputEl.value = initStr;
        t.onChange(v => {
          if (!v) { onChange(null); return; }
          const parsed = this.parseDate(v);
          if (parsed) onChange(parsed);
        });
      });
      s.addExtraButton(btn => btn
        .setIcon('x')
        .setTooltip('清除日期')
        .onClick(() => {
          textControl.inputEl.value = '';
          onChange(null);
        })
      );
      return input;
    };

    addDateSetting('创建日期', this.task.createdDate, (d) => this.createdDate = d);
    addDateSetting('开始日期', this.task.startDate, (d) => this.startDate = d);
    addDateSetting('计划日期', this.task.scheduledDate, (d) => this.scheduledDate = d);
    addDateSetting('截止日期', this.task.dueDate, (d) => this.dueDate = d);
    addDateSetting('完成日期', this.task.completionDate, (d) => this.completionDate = d);
    addDateSetting('取消日期', this.task.cancelledDate, (d) => this.cancelledDate = d);

    // 操作按钮
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('保存')
        .setCta()
        .onClick(async () => {
          try {
            // 只将实际更改的字段写入，未更改的字段保留原值
            const updates: any = {};
            if (this.completed !== undefined) updates.completed = this.completed;
            if (this.priority !== undefined) updates.priority = this.priority;
            if (this.createdDate !== undefined) updates.createdDate = this.createdDate;
            if (this.startDate !== undefined) updates.startDate = this.startDate;
            if (this.scheduledDate !== undefined) updates.scheduledDate = this.scheduledDate;
            if (this.dueDate !== undefined) updates.dueDate = this.dueDate;
            if (this.completionDate !== undefined) updates.completionDate = this.completionDate;
            if (this.cancelledDate !== undefined) updates.cancelledDate = this.cancelledDate;
            if (this.content !== undefined) updates.content = this.content;
            await updateTaskProperties(this.app, this.task, updates, this.enabledFormats);
            this.onSuccess();
            this.close();
            new Notice('任务已更新');
          } catch (err) {
            console.error('Failed to update task', err);
            new Notice('更新任务失败');
          }
        }))
      .addButton(btn => btn
        .setButtonText('取消')
        .onClick(() => this.close())
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private parseDate(dateStr: string): Date | null {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }
}

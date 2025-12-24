import { App, Modal, Setting, Notice } from 'obsidian';
import type { GanttTask } from '../../types';
import { updateTaskProperties } from '../../taskManager';


export function openEditTaskModal(
  app: App,
  task: GanttTask,
  enabledFormats: string[],
  onSuccess: () => void,
  allowEditContent?: boolean,
  globalFilter?: string
): void {
  const modal = new EditTaskModal(app, task, enabledFormats, onSuccess, allowEditContent, globalFilter);
  modal.open();
}

class EditTaskModal extends Modal {
  private task: GanttTask;
  private enabledFormats: string[];
  private onSuccess: () => void;
  private allowEditContent: boolean;
  private globalFilter?: string;

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

  constructor(app: App, task: GanttTask, enabledFormats: string[], onSuccess: () => void, allowEditContent?: boolean, globalFilter?: string) {
    super(app);
    this.task = task;
    this.enabledFormats = enabledFormats;
    this.onSuccess = onSuccess;
    this.allowEditContent = !!allowEditContent;
    this.globalFilter = globalFilter;

    // 初始化为“未更改”状态（undefined），用户修改才记录
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
      // 使用已解析的 description，移除 wiki 链接
      const pureContent = extractPureTaskDescription(this.task);
      new Setting(contentEl)
        .setName('任务描述')
        .setDesc('修改任务的描述内容')
        .addTextArea(text => {
          text.setValue(pureContent);
          text.inputEl.rows = 2;
          text.inputEl.style.width = '100%';
          text.onChange((v) => {
            this.content = v;
          });
        });
    }

    // 提取纯任务描述（不带 wiki 链接）
    // 注意：task.description 已经包含了移除元数据标记后的文本
    function extractPureTaskDescription(task: GanttTask): string {
    // 使用已解析的 description，只需额外处理 wiki 链接
    let text = task.description || '';
    // 移除 wiki 链接 [[note]] 或 [[note|alias]]
    text = text.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, ' ');
    // 清理多余空格
    text = text.replace(/\s{2,}/g, ' ').trim();
    return text;
    }

    // 完成状态
    new Setting(contentEl)
      .setName('完成状态')
      .setDesc('勾选表示任务已完成')
      .addToggle(toggle => {
        toggle.setValue(this.task.completed);
        toggle.onChange(value => {
          this.completed = value;
        });
      });

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
      const input = s.addText(t => {
        const initStr = current ? this.formatDate(current) : '';
        t.setPlaceholder('YYYY-MM-DD').setValue(initStr);
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
        .onClick(() => onChange(null))
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
            const updates: any = {
              globalFilter: this.globalFilter
            };
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

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private parseDate(dateStr: string): Date | null {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }
}

import { App, Modal, Setting, Notice } from 'obsidian';
import type { GCTask } from '../../types';
import { updateTaskProperties } from '../../tasks/taskUpdater';
import { formatDate } from '../../dateUtils/dateUtilsIndex';


export function openEditTaskModal(
  app: App,
  task: GCTask,
  enabledFormats: string[],
  onSuccess: () => void,
  allowEditContent?: boolean
): void {
  const modal = new EditTaskModal(app, task, enabledFormats, onSuccess, allowEditContent);
  modal.open();
}

class EditTaskModal extends Modal {
  private task: GCTask;
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

  constructor(app: App, task: GCTask, enabledFormats: string[], onSuccess: () => void, allowEditContent?: boolean) {
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

    // 添加紧凑样式
    this.addCompactStyles();

    // 任务描述（可选）
    if (this.allowEditContent) {
      const descContainer = contentEl.createDiv({ cls: 'gc-edit-desc-container' });
      descContainer.createEl('label', { text: '任务描述', cls: 'gc-edit-label' });
      descContainer.createEl('div', { text: '不支持换行，Enter 键将转为空格', cls: 'gc-edit-hint' });

      const textArea = descContainer.createEl('textarea', { cls: 'gc-edit-textarea' });
      textArea.value = this.task.description || '';

      // 阻止换行：Enter 键转为空格
      textArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const start = textArea.selectionStart;
          const end = textArea.selectionEnd;
          const value = textArea.value;
          textArea.value = value.slice(0, start) + ' ' + value.slice(end);
          textArea.selectionStart = textArea.selectionEnd = start + 1;
          this.content = textArea.value;
        }
      });

      textArea.addEventListener('input', () => {
        // 兜底：将任何换行符替换为空格
        this.content = textArea.value.replace(/[\r\n]+/g, ' ');
      });
    }

    // 优先级选择（按钮网格）
    const priorityContainer = contentEl.createDiv({ cls: 'gc-priority-container' });
    priorityContainer.createEl('label', { text: '优先级', cls: 'gc-edit-label' });

    const priorityGrid = priorityContainer.createDiv({ cls: 'gc-priority-grid' });
    const priorityOptions: Array<{ value: any, label: string, icon: string }> = [
      { value: 'highest', label: '最高', icon: '🔺' },
      { value: 'high', label: '高', icon: '⏫' },
      { value: 'medium', label: '中', icon: '🔼' },
      { value: 'normal', label: '普通', icon: '◽' },
      { value: 'low', label: '低', icon: '🔽' },
      { value: 'lowest', label: '最低', icon: '⏬' },
    ];

    priorityOptions.forEach(option => {
      const btn = priorityGrid.createEl('button', {
        cls: 'gc-priority-btn',
        text: `${option.icon} ${option.label}`
      });
      btn.dataset.value = option.value;

      btn.addEventListener('click', () => {
        // 移除所有按钮的选中状态
        priorityGrid.querySelectorAll('.gc-priority-btn').forEach(b => b.removeClass('gc-priority-selected'));
        // 添加当前按钮的选中状态
        btn.addClass('gc-priority-selected');
        // 记录用户选择的优先级，'normal' 表示普通（无优先级）
        this.priority = option.value;
      });
    });

    // 日期输入（紧凑布局）
    const dateContainer = contentEl.createDiv({ cls: 'gc-dates-container' });
    dateContainer.createEl('label', { text: '日期设置', cls: 'gc-edit-label' });

    const datesGrid = dateContainer.createDiv({ cls: 'gc-dates-grid' });

    const addDateSetting = (
      label: string,
      current: Date | undefined,
      onChange: (d: Date | null) => void
    ) => {
      const dateItem = datesGrid.createDiv({ cls: 'gc-date-item' });
      const labelEl = dateItem.createEl('label', { text: label, cls: 'gc-date-label' });

      const inputContainer = dateItem.createDiv({ cls: 'gc-date-input-container' });
      const input = inputContainer.createEl('input', { type: 'date', cls: 'gc-date-input' });

      const initStr = current ? formatDate(current, 'yyyy-MM-dd') : '';
      if (initStr) input.value = initStr;

      input.addEventListener('change', () => {
        if (!input.value) {
          onChange(null);
          return;
        }
        const parsed = this.parseDate(input.value);
        if (parsed) onChange(parsed);
      });

      const clearBtn = inputContainer.createEl('button', {
        cls: 'gc-date-clear',
        text: '×'
      });
      clearBtn.addEventListener('click', () => {
        input.value = '';
        onChange(null);
      });
    };

    addDateSetting('➕ 创建', this.task.createdDate, (d) => this.createdDate = d);
    addDateSetting('🛫 开始', this.task.startDate, (d) => this.startDate = d);
    addDateSetting('⏳ 计划', this.task.scheduledDate, (d) => this.scheduledDate = d);
    addDateSetting('📅 截止', this.task.dueDate, (d) => this.dueDate = d);
    addDateSetting('✅ 完成', this.task.completionDate, (d) => this.completionDate = d);
    addDateSetting('❌ 取消', this.task.cancelledDate, (d) => this.cancelledDate = d);

    // 操作按钮
    const buttonContainer = contentEl.createDiv({ cls: 'gc-edit-buttons' });
    buttonContainer.createEl('button', { cls: 'mod-cta', text: '保存' }).addEventListener('click', async () => {
      try {
        const updates: any = {};
        if (this.completed !== undefined) updates.completed = this.completed;
        // 直接传递优先级值，'normal' 会被 serializeTask 正确处理为清除优先级
        if (this.priority !== undefined) {
          updates.priority = this.priority;
        }
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
    });
    buttonContainer.createEl('button', { text: '取消' }).addEventListener('click', () => this.close());
  }

  private addCompactStyles(): void {
    // 创建样式元素
    const style = document.createElement('style');
    style.textContent = `
      .gc-edit-desc-container {
        margin-bottom: 16px;
      }
      .gc-edit-label {
        display: block;
        font-weight: 600;
        margin-bottom: 8px;
        font-size: var(--font-ui-small);
        color: var(--text-normal);
      }
      .gc-edit-hint {
        font-size: var(--font-ui-smaller);
        color: var(--text-muted);
        margin-bottom: 8px;
      }
      .gc-edit-textarea {
        width: 100%;
        min-height: 60px;
        max-height: 60px;
        padding: 8px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        background: var(--background-secondary);
        color: var(--text-normal);
        resize: none;
        overflow: auto;
        font-family: var(--font-interface);
        font-size: var(--font-ui-small);
      }
      .gc-edit-textarea:focus {
        outline: 2px solid var(--interactive-accent);
        border-color: var(--interactive-accent);
      }
      .gc-priority-container {
        margin-bottom: 20px;
      }
      .gc-priority-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-top: 8px;
      }
      .gc-priority-btn {
        padding: 8px 12px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        background: var(--background-secondary);
        color: var(--text-normal);
        cursor: pointer;
        font-size: var(--font-ui-small);
        transition: all 0.2s;
      }
      .gc-priority-btn:hover {
        background: var(--background-modifier-hover);
      }
      .gc-priority-selected {
        background: var(--interactive-accent) !important;
        color: var(--text-on-accent) !important;
        border-color: var(--interactive-accent) !important;
      }
      .gc-dates-container {
        margin-bottom: 20px;
      }
      .gc-dates-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
      .gc-date-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .gc-date-label {
        font-size: var(--font-ui-smaller);
        color: var(--text-muted);
        font-weight: 500;
      }
      .gc-date-input-container {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .gc-date-input {
        flex: 1;
        padding: 6px 8px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        background: var(--background-secondary);
        color: var(--text-normal);
        font-size: var(--font-ui-small);
      }
      .gc-date-input:focus {
        outline: 2px solid var(--interactive-accent);
        border-color: var(--interactive-accent);
      }
      .gc-date-clear {
        width: 32px;
        height: 32px;
        padding: 0;
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        background: var(--background-secondary);
        color: var(--text-muted);
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .gc-date-clear:hover {
        background: var(--background-modifier-hover);
        color: var(--text-normal);
      }
      .gc-edit-buttons {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        margin-top: 24px;
      }
      .gc-edit-buttons button {
        padding: 8px 16px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        background: var(--background-secondary);
        color: var(--text-normal);
        cursor: pointer;
        font-size: var(--font-ui-small);
      }
      .gc-edit-buttons button:hover {
        background: var(--background-modifier-hover);
      }
      .gc-edit-buttons button.mod-cta {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        border-color: var(--interactive-accent);
      }
      .gc-edit-buttons button.mod-cta:hover {
        background: var(--interactive-accent-hover);
      }
    `;
    document.head.appendChild(style);
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

/**
 * 编辑任务弹窗
 *
 * 提供编辑任务的界面，基于 BaseTaskModal 基类。
 *
 * @fileoverview 编辑任务弹窗
 * @module modals/EditTaskModal
 */

import { App, Notice } from 'obsidian';
import type { GCTask } from '../types';
import { updateTaskProperties } from '../tasks/taskUpdater';
import { Logger } from '../utils/logger';
import { BaseTaskModal, type PriorityOption, type RepeatConfig } from './BaseTaskModal';

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

class EditTaskModal extends BaseTaskModal {
	private task: GCTask;
	private enabledFormats: string[];
	private onSuccess: () => void;
	private allowEditContent: boolean;

	// 状态缓存（初始化为"未更改"状态）
	// 使用单独的变量来跟踪是否有修改，而不是覆盖基类属性
	private priorityChanged: boolean = false;
	private repeatChanged: boolean = false;
	private datesChanged: boolean = false;
	private contentChanged: boolean = false;
	private tagsChanged: boolean = false;
	private content: string | undefined = undefined;

	constructor(
		app: App,
		task: GCTask,
		enabledFormats: string[],
		onSuccess: () => void,
		allowEditContent?: boolean
	) {
		super(app);
		this.task = task;
		this.enabledFormats = enabledFormats;
		this.onSuccess = onSuccess;
		this.allowEditContent = !!allowEditContent;

		// 从现有任务初始化基类属性
		this.priority = (task.priority as PriorityOption['value']) || 'normal';
		this.repeat = task.repeat || null;
		this.createdDate = task.createdDate || null;
		this.startDate = task.startDate || null;
		this.scheduledDate = task.scheduledDate || null;
		this.dueDate = task.dueDate || null;
		this.cancelledDate = task.cancelledDate || null;
		this.completionDate = task.completionDate || null;
		this.selectedTags = task.tags || [];
	}

	onOpen(): void {
		this.renderModalContent('编辑任务');
	}

	// ==================== 实现抽象方法 ====================

	/**
	 * 渲染任务描述板块
	 */
	protected renderDescriptionSection(container: HTMLElement): void {
		if (!this.allowEditContent) {
			return;
		}

		const { EditTaskModalClasses } = require('../utils/bem') as typeof import('../utils/bem');
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const descContainer = section.createDiv(EditTaskModalClasses.elements.descContainer);
		descContainer.createEl('label', {
			text: '任务描述',
			cls: EditTaskModalClasses.elements.sectionLabel
		});
		descContainer.createEl('div', {
			text: '不支持换行，Enter 键将转为空格',
			cls: EditTaskModalClasses.elements.sectionHint
		});

		const textArea = descContainer.createEl('textarea', {
			cls: EditTaskModalClasses.elements.descTextarea
		});
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
				this.contentChanged = true;
			}
		});

		textArea.addEventListener('input', () => {
			// 兜底：将任何换行符替换为空格
			this.content = textArea.value.replace(/[\r\n]+/g, ' ');
			this.contentChanged = true;
		});
	}

	/**
	 * 保存任务
	 */
	protected async saveTask(): Promise<void> {
		try {
			const updates: any = {};

			// 只添加已修改的字段
			if (this.priorityChanged) {
				updates.priority = this.priority;
			}
			if (this.repeatChanged) {
				updates.repeat = this.repeat;
			}
			if (this.datesChanged) {
				updates.createdDate = this.createdDate;
				updates.startDate = this.startDate;
				updates.scheduledDate = this.scheduledDate;
				updates.dueDate = this.dueDate;
				updates.completionDate = this.completionDate;
				updates.cancelledDate = this.cancelledDate;
			}
			if (this.contentChanged) {
				updates.content = this.content;
			}
			if (this.tagsChanged) {
				updates.tags = this.selectedTags;
			}

			// 如果没有任何更改，直接关闭
			if (Object.keys(updates).length === 0) {
				this.close();
				return;
			}

			await updateTaskProperties(this.app, this.task, updates, this.enabledFormats);
			this.onSuccess();
			this.close();
			new Notice('任务已更新');
		} catch (err) {
			Logger.error('editTask', 'Failed to update task', err);
			new Notice('更新任务失败');
		}
	}

	/**
	 * 获取初始标签列表
	 */
	protected getInitialTags(): string[] {
		return this.task.tags || [];
	}

	/**
	 * 获取所有任务（用于标签推荐）
	 */
	protected getAllTasksForTags(): GCTask[] {
		return this.getAllTasks();
	}

	/**
	 * 获取按钮文本
	 */
	protected getButtonTexts(): { cancel: string; save: string } {
		return { cancel: '取消', save: '保存' };
	}

	// ==================== 重写基类方法 ====================

	/**
	 * 重写 renderPrioritySection 以跟踪优先级变化
	 */
	protected renderPrioritySection(container: HTMLElement): void {
		const { EditTaskModalClasses } = require('../utils/bem') as typeof import('../utils/bem');
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const priorityContainer = section.createDiv(EditTaskModalClasses.elements.priorityContainer);
		priorityContainer.createEl('label', {
			text: '优先级',
			cls: EditTaskModalClasses.elements.sectionLabel
		});

		const priorityGrid = priorityContainer.createDiv(EditTaskModalClasses.elements.priorityGrid);

		this.priorityOptions.forEach(option => {
			const btn = priorityGrid.createEl('button', {
				cls: EditTaskModalClasses.elements.priorityBtn,
				text: `${option.icon} ${option.label}`
			});
			btn.dataset.value = option.value;

			// 如果是当前优先级，设置为选中状态
			if (option.value === this.priority) {
				btn.addClass(EditTaskModalClasses.elements.priorityBtnSelected);
			}

			btn.addEventListener('click', () => {
				// 移除所有按钮的选中状态
				priorityGrid.querySelectorAll(`.${EditTaskModalClasses.elements.priorityBtn}`)
					.forEach(b => b.removeClass(EditTaskModalClasses.elements.priorityBtnSelected));
				// 添加当前按钮的选中状态
				btn.addClass(EditTaskModalClasses.elements.priorityBtnSelected);
				this.priority = option.value;
				this.priorityChanged = true;
			});
		});
	}

	/**
	 * 重写 renderDateField 以跟踪日期变化
	 */
	protected renderDateField(
		container: HTMLElement,
		label: string,
		current: Date | null,
		onChange: (d: Date | null) => void
	): void {
		const { EditTaskModalClasses } = require('../utils/bem') as typeof import('../utils/bem');
		const dateItem = container.createDiv(EditTaskModalClasses.elements.dateItem);
		const labelEl = dateItem.createEl('label', {
			text: label,
			cls: EditTaskModalClasses.elements.dateLabel
		});

		const inputContainer = dateItem.createDiv(EditTaskModalClasses.elements.dateInputContainer);
		const input = inputContainer.createEl('input', {
			type: 'date',
			cls: EditTaskModalClasses.elements.dateInput
		});

		const initStr = current ? this.formatDateForInput(current) : '';
		if (initStr) input.value = initStr;

		input.addEventListener('change', () => {
			if (!input.value) {
				onChange(null);
				this.datesChanged = true;
				return;
			}
			const parsed = this.parseDate(input.value);
			if (parsed) {
				onChange(parsed);
				this.datesChanged = true;
			}
		});

		const clearBtn = inputContainer.createEl('button', {
			cls: EditTaskModalClasses.elements.dateClear,
			text: '×'
		});
		clearBtn.addEventListener('click', () => {
			input.value = '';
			onChange(null);
			this.datesChanged = true;
		});
	}

	/**
	 * 重写 renderTagsSection 以跟踪标签变化
	 */
	protected renderTagsSection(container: HTMLElement): void {
		const { EditTaskModalClasses } = require('../utils/bem') as typeof import('../utils/bem');
		const { TagSelector } = require('../components/TagSelector') as typeof import('../components/TagSelector');
		const section = container.createDiv(EditTaskModalClasses.elements.section);
		const tagsContainer = section.createDiv(EditTaskModalClasses.elements.tagsSection);

		this.tagSelector = new TagSelector({
			container: tagsContainer,
			allTasks: this.getAllTasksForTags(),
			initialTags: this.getInitialTags(),
			compact: false,
			onChange: (tags) => {
				this.selectedTags = tags;
				this.tagsChanged = true;
			}
		});
	}

	/**
	 * 重写 renderRepeatSection 以跟踪 repeat 变化
	 */
	protected renderRepeatSection(container: HTMLElement): void {
		const { EditTaskModalClasses } = require('../utils/bem') as typeof import('../utils/bem');
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const repeatContainer = section.createDiv(EditTaskModalClasses.elements.repeatSection);

		// 标题行：左侧标签 + 右侧清除按钮
		const headerRow = repeatContainer.createDiv();
		headerRow.style.display = 'flex';
		headerRow.style.justifyContent = 'space-between';
		headerRow.style.alignItems = 'center';
		headerRow.style.marginBottom = '12px';

		headerRow.createEl('label', {
			text: '重复设置',
			cls: EditTaskModalClasses.elements.sectionLabel
		});

		const clearBtn = headerRow.createEl('button', {
			cls: EditTaskModalClasses.elements.repeatClearBtn,
			text: '× 清除'
		});
		clearBtn.style.padding = '2px 8px';
		clearBtn.style.fontSize = 'var(--font-ui-smaller)';
		clearBtn.style.color = 'var(--text-muted)';

		const repeatGrid = repeatContainer.createDiv(EditTaskModalClasses.elements.repeatGrid);

		// ========== 频率选择行：每 [间隔输入] [单位下拉] [自定义输入] ==========
		const freqSelectRow = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatRow);
		freqSelectRow.style.display = 'flex';
		freqSelectRow.style.alignItems = 'center';
		freqSelectRow.style.gap = '8px';
		freqSelectRow.style.marginBottom = '12px';
		freqSelectRow.style.flexWrap = 'wrap';

		freqSelectRow.createEl('span', { text: '每' });

		const intervalInput = freqSelectRow.createEl('input', {
			type: 'number',
			value: '1',
			cls: EditTaskModalClasses.elements.repeatIntervalInput
		});
		intervalInput.min = '1';
		intervalInput.style.width = '60px';
		intervalInput.style.padding = '4px 8px';

		const freqSelect = freqSelectRow.createEl('select', {
			cls: EditTaskModalClasses.elements.repeatFreqSelect
		});
		freqSelect.style.padding = '4px 8px';

		const freqOptions = [
			{ value: '', label: '不重复' },
			{ value: 'daily', label: '天' },
			{ value: 'weekly', label: '周' },
			{ value: 'monthly', label: '月' },
			{ value: 'yearly', label: '年' },
			{ value: 'custom', label: '自定义' },
		];
		freqOptions.forEach(opt => {
			freqSelect.createEl('option', { value: opt.value, text: opt.label });
		});

		// ========== 自定义规则输入（选择"自定义"时显示，在同一行） ==========
		const manualInput = freqSelectRow.createEl('input', {
			type: 'text',
			placeholder: '如: every week on Monday when done',
			cls: EditTaskModalClasses.elements.repeatManualInput
		});
		manualInput.style.display = 'none';
		manualInput.style.flex = '1';
		manualInput.style.minWidth = '200px';
		manualInput.style.padding = '4px 8px';

		// ========== 每周模式：星期选择按钮（默认隐藏，在同一行） ==========
		const weeklyDaysContainer = freqSelectRow.createSpan(EditTaskModalClasses.elements.repeatDaysContainer);
		weeklyDaysContainer.style.display = 'none';
		weeklyDaysContainer.style.alignItems = 'center';
		weeklyDaysContainer.style.gap = '4px';

		const weekDaysLabel = weeklyDaysContainer.createSpan({ text: '  ' });
		const dayButtons: HTMLButtonElement[] = [];
		const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
		dayNames.forEach((dayName) => {
			const dayBtn = weeklyDaysContainer.createEl('button', {
				cls: EditTaskModalClasses.elements.repeatDayCheckbox,
				text: dayName
			});
			dayBtn.type = 'button';
			dayBtn.style.padding = '4px 6px';
			dayBtn.style.minWidth = '28px';
			dayBtn.style.border = '1px solid var(--background-modifier-border)';
			dayBtn.style.borderRadius = '4px';
			dayBtn.style.backgroundColor = 'var(--background-secondary)';
			dayBtn.style.cursor = 'pointer';
			dayBtn.style.fontSize = 'var(--font-ui-smaller)';

			dayBtn.addEventListener('click', () => {
				dayBtn.classList.toggle('active');
				if (dayBtn.classList.contains('active')) {
					dayBtn.style.backgroundColor = 'var(--interactive-accent)';
					dayBtn.style.color = 'var(--text-on-accent)';
					dayBtn.style.borderColor = 'var(--interactive-accent)';
				} else {
					dayBtn.style.backgroundColor = 'var(--background-secondary)';
					dayBtn.style.color = 'var(--text-normal)';
					dayBtn.style.borderColor = 'var(--background-modifier-border)';
				}
				updateRepeat();
			});

			dayButtons.push(dayBtn);
		});

		// ========== 每月模式：日期选择输入框（默认隐藏，在同一行） ==========
		const monthlyDayContainer = freqSelectRow.createSpan(EditTaskModalClasses.elements.repeatMonthContainer);
		monthlyDayContainer.style.display = 'none';
		monthlyDayContainer.style.alignItems = 'center';
		monthlyDayContainer.style.gap = '4px';

		const monthDayLabel = monthlyDayContainer.createSpan({ text: '  ' });
		const monthDayInput = monthlyDayContainer.createEl('input', {
			type: 'number',
			cls: EditTaskModalClasses.elements.repeatMonthSelect,
			placeholder: '日期'
		});
		monthDayInput.min = '1';
		monthDayInput.max = '31';
		monthDayInput.style.width = '60px';
		monthDayInput.style.padding = '4px 6px';
		monthDayInput.style.fontSize = 'var(--font-ui-small)';

		// ========== 重复方式选择 ==========
		const whenDoneRow = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatWhenDoneContainer);
		whenDoneRow.style.display = 'flex';
		whenDoneRow.style.alignItems = 'center';
		whenDoneRow.style.gap = '8px';
		whenDoneRow.style.marginBottom = '12px';

		whenDoneRow.createEl('span', { text: '重复方式：' });
		whenDoneRow.style.fontSize = 'var(--font-ui-small)';
		whenDoneRow.style.color = 'var(--text-muted)';

		const whenDoneToggle = whenDoneRow.createEl('input', {
			type: 'radio',
			cls: EditTaskModalClasses.elements.repeatWhenDoneToggle
		});
		whenDoneToggle.setAttribute('name', 'repeat-type');
		whenDoneToggle.id = 'repeat-fixed';
		whenDoneToggle.checked = true;

		const fixedLabel = whenDoneRow.createEl('label', {
			text: '按固定日期重复'
		});
		fixedLabel.setAttribute('for', 'repeat-fixed');
		fixedLabel.style.fontSize = 'var(--font-ui-small)';

		const whenDoneToggle2 = whenDoneRow.createEl('input', {
			type: 'radio',
			cls: EditTaskModalClasses.elements.repeatWhenDoneToggle
		});
		whenDoneToggle2.setAttribute('name', 'repeat-type');
		whenDoneToggle2.id = 'repeat-when-done';

		const whenDoneLabel = whenDoneRow.createEl('label', {
			text: '完成后重新计算'
		});
		whenDoneLabel.setAttribute('for', 'repeat-when-done');
		whenDoneLabel.style.fontSize = 'var(--font-ui-small)';
		whenDoneLabel.setAttribute('title', '下次任务的日期从完成当天算起，而不是从原计划日期算起');

		// ========== 预览摘要区域 ==========
		const previewBox = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatPreview);
		previewBox.style.padding = '8px 12px';
		previewBox.style.backgroundColor = 'var(--background-modifier-hover)';
		previewBox.style.borderRadius = '4px';
		previewBox.style.fontSize = 'var(--font-ui-small)';
		previewBox.style.color = 'var(--text-muted)';
		previewBox.style.marginBottom = '12px';
		previewBox.style.minHeight = '36px';
		previewBox.style.display = 'flex';
		previewBox.style.alignItems = 'center';

		const previewText = previewBox.createEl('span', {
			text: 'no repeat',
			cls: EditTaskModalClasses.elements.repeatPreviewText
		});

		// ========== 规则说明 ==========
		const rulesHint = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatRulesHint);
		rulesHint.style.marginTop = '8px';
		rulesHint.style.padding = '8px';
		rulesHint.style.backgroundColor = 'var(--background-modifier-hover)';
		rulesHint.style.borderRadius = '4px';
		rulesHint.style.fontSize = 'var(--font-ui-smaller)';

		const rulesHintTitle = rulesHint.createEl('div', {
			text: '支持的规则：',
			cls: EditTaskModalClasses.elements.repeatRulesHintTitle
		});
		rulesHintTitle.style.fontWeight = 'var(--font-medium)';
		rulesHintTitle.style.marginBottom = '4px';

		const rulesHintList = rulesHint.createEl('div', {
			text: '• every day / every 3 days / every weekday / every weekend\n• every week / every 2 weeks / every week on Monday, Friday\n• every month / every month on the 15th / on the last\n• every year / every January on the 15th\n• 添加 "when done" 表示基于完成日期计算',
			cls: EditTaskModalClasses.elements.repeatRulesHintList
		});
		rulesHintList.style.whiteSpace = 'pre-line';
		rulesHintList.style.color = 'var(--text-muted)';

		// ========== 错误提示 ==========
		const errorMsg = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatErrorMsg);
		errorMsg.style.display = 'none';
		errorMsg.style.color = 'var(--text-error)';
		errorMsg.style.fontSize = 'var(--font-ui-smaller)';
		errorMsg.style.marginTop = '4px';

		// ========== 辅助函数：获取选中的星期 ==========
		const getSelectedDays = (): number[] | undefined => {
			const selected: number[] = [];
			dayButtons.forEach((btn, idx) => {
				if (btn.classList.contains('active')) {
					selected.push(idx);
				}
			});
			return selected.length > 0 ? selected : undefined;
		};

		// ========== 更新逻辑 ==========
		const updateRepeat = () => {
			this.repeatChanged = true;

			const freqValue = freqSelect.value;
			const interval = parseInt(intervalInput.value) || 1;

			// 不重复
			if (!freqValue) {
				this.repeat = null;
				previewText.textContent = 'no repeat';
				manualInput.style.display = 'none';
				weeklyDaysContainer.style.display = 'none';
				monthlyDayContainer.style.display = 'none';
				return;
			}

			// 自定义模式：直接使用用户输入的规则
			if (freqValue === 'custom') {
				const manualRule = manualInput.value.trim();
				if (manualRule) {
					// 验证规则格式
					if (this.validateRepeatRule(manualRule)) {
						this.repeat = manualRule;
						previewText.textContent = manualRule;
						errorMsg.style.display = 'none';
					} else {
						errorMsg.textContent = '规则格式不正确';
						errorMsg.style.display = 'block';
					}
				} else {
					this.repeat = null;
					previewText.textContent = 'no repeat';
				}
				weeklyDaysContainer.style.display = 'none';
				monthlyDayContainer.style.display = 'none';
				return;
			}

			// 预设模式：根据选择的频率生成规则
			const whenDone = whenDoneToggle2.checked;

			// 获取每周模式的选中日期
			const selectedDays = getSelectedDays();

			// 获取每月模式的日期
			let monthDayValue: number | string | undefined = undefined;
			if (freqValue === 'monthly') {
				const monthInputVal = monthDayInput.value.trim();
				if (monthInputVal) {
					const dayNum = parseInt(monthInputVal);
					if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
						monthDayValue = dayNum;
					}
				}
			}

			const config: RepeatConfig = {
				frequency: freqValue as 'daily' | 'weekly' | 'monthly' | 'yearly',
				interval,
				days: selectedDays,
				monthDay: monthDayValue,
				whenDone
			};

			const rule = this.buildRepeatRule(config);
			this.repeat = rule;
			previewText.textContent = rule;
			errorMsg.style.display = 'none';
		};

		// ========== 事件监听 ==========
		// 频率下拉选择变化
		freqSelect.addEventListener('change', () => {
			const value = freqSelect.value;

			// 重置所有特殊选项显示
			manualInput.style.display = 'none';
			weeklyDaysContainer.style.display = 'none';
			monthlyDayContainer.style.display = 'none';

			// 清除星期选择
			dayButtons.forEach(btn => {
				btn.classList.remove('active');
				btn.style.backgroundColor = 'var(--background-secondary)';
				btn.style.color = 'var(--text-normal)';
				btn.style.borderColor = 'var(--background-modifier-border)';
			});
			monthDayInput.value = '';

			if (value === 'custom') {
				manualInput.style.display = 'block';
				// 预填充简单规则
				const interval = parseInt(intervalInput.value) || 1;
				const whenDone = whenDoneToggle2.checked;
				let defaultRule = interval === 1 ? 'every week' : `every ${interval} weeks`;
				if (whenDone) defaultRule += ' when done';
				manualInput.value = defaultRule;
			} else if (value === 'weekly') {
				weeklyDaysContainer.style.display = 'flex';
			} else if (value === 'monthly') {
				monthlyDayContainer.style.display = 'flex';
			}

			updateRepeat();
		});

		// 间隔输入变化
		intervalInput.addEventListener('input', updateRepeat);

		// 自定义规则输入变化
		manualInput.addEventListener('input', updateRepeat);

		// 月份日期输入变化
		monthDayInput.addEventListener('input', updateRepeat);

		// 重复方式变化
		whenDoneToggle.addEventListener('change', updateRepeat);
		whenDoneToggle2.addEventListener('change', updateRepeat);

		// ========== 清除按钮事件 ==========
		clearBtn.addEventListener('click', () => {
			// 重置UI
			freqSelect.value = '';
			intervalInput.value = '1';
			whenDoneToggle.checked = true;
			whenDoneToggle2.checked = false;
			manualInput.value = '';
			manualInput.style.display = 'none';
			weeklyDaysContainer.style.display = 'none';
			monthlyDayContainer.style.display = 'none';
			monthDayInput.value = '';
			dayButtons.forEach(btn => {
				btn.classList.remove('active');
				btn.style.backgroundColor = 'var(--background-secondary)';
				btn.style.color = 'var(--text-normal)';
				btn.style.borderColor = 'var(--background-modifier-border)';
			});

			this.repeat = null;
			previewText.textContent = 'no repeat';
			errorMsg.style.display = 'none';
		});

		// 初始化当前值
		this.initRepeatValue(freqSelect, intervalInput, manualInput, whenDoneToggle2, dayButtons, monthDayInput, weeklyDaysContainer, monthlyDayContainer, updateRepeat);
	}

	/**
	 * 初始化 repeat 值（从现有任务中加载）
	 */
	protected initRepeatValue(
		freqSelect: HTMLSelectElement,
		intervalInput: HTMLInputElement,
		manualInput: HTMLInputElement,
		whenDoneToggle2: HTMLInputElement,
		dayButtons: HTMLButtonElement[],
		monthDayInput: HTMLInputElement,
		weeklyDaysContainer: HTMLElement,
		monthlyDayContainer: HTMLElement,
		updateRepeat: () => void
	): void {
		const currentRepeat = this.task.repeat;
		if (!currentRepeat) {
			// 默认选中"不重复"
			freqSelect.value = '';
			intervalInput.value = '1';
			manualInput.style.display = 'none';
			weeklyDaysContainer.style.display = 'none';
			monthlyDayContainer.style.display = 'none';
			return;
		}

		const config = this.parseRepeatToConfig(currentRepeat);
		if (config) {
			// 设置间隔
			intervalInput.value = String(config.interval);

			// 设置 when done
			whenDoneToggle2.checked = config.whenDone;

			// 判断是否是标准规则（间隔为1且没有特殊星期/日期选择）
			const isStandardRule = config.interval === 1 &&
				(!config.days || config.days.length <= 1) &&
				(!config.monthDay || config.monthDay === 1);

			if (isStandardRule) {
				// 使用预设模式
				freqSelect.value = config.frequency;
				manualInput.style.display = 'none';

				// 设置星期选择
				if (config.days && config.days.length > 0) {
					config.days.forEach(dayIdx => {
						if (dayButtons[dayIdx]) {
							dayButtons[dayIdx].classList.add('active');
							dayButtons[dayIdx].style.backgroundColor = 'var(--interactive-accent)';
							dayButtons[dayIdx].style.color = 'var(--text-on-accent)';
						}
					});
					weeklyDaysContainer.style.display = 'flex';
				}

				// 设置月份日期选择
				if (config.monthDay && config.monthDay !== 'last' && typeof config.monthDay === 'number') {
					monthDayInput.value = String(config.monthDay);
					monthlyDayContainer.style.display = 'flex';
				} else if (config.monthDay === 'last') {
					monthDayInput.value = 'last';
					monthlyDayContainer.style.display = 'flex';
				}
			} else {
				// 使用自定义模式
				freqSelect.value = 'custom';
				manualInput.value = currentRepeat;
				manualInput.style.display = 'block';
				weeklyDaysContainer.style.display = 'none';
				monthlyDayContainer.style.display = 'none';
			}

			// 更新预览
			updateRepeat();
		} else {
			// 无法解析的规则，使用自定义模式
			freqSelect.value = 'custom';
			manualInput.value = currentRepeat;
			manualInput.style.display = 'block';
			weeklyDaysContainer.style.display = 'none';
			monthlyDayContainer.style.display = 'none';
			whenDoneToggle2.checked = currentRepeat.toLowerCase().includes('when done');
			updateRepeat();
		}
	}

	// ==================== EditTaskModal 特有方法 ====================

	/**
	 * 获取所有任务（用于推荐标签）
	 */
	private getAllTasks(): GCTask[] {
		const plugin = (this.app as any).plugins.plugins['gantt-calendar'];
		if (plugin?.taskCache) {
			return plugin.taskCache.getAllTasks();
		}
		return [];
	}
}

// 导出类型
export type { PriorityOption, RepeatConfig } from './BaseTaskModal';

/**
 * 编辑任务弹窗
 *
 * 提供编辑任务的界面，基于 BaseTaskModal 基类。
 *
 * @fileoverview 编辑任务弹窗
 * @module modals/EditTaskModal
 */

import { App, Notice, setIcon } from 'obsidian';
import type { GCTask } from '../types';
import type { TaskUpdates } from '../tasks/taskSerializer';
import { updateTaskProperties } from '../tasks/taskUpdater';
import { Logger } from '../utils/logger';
import { BaseTaskModal, type PriorityOption, type RepeatConfig } from './BaseTaskModal';
import { i18n } from '../i18n/i18n';
import { TagSelector } from '../components/TagSelector';
import { EditTaskModalClasses, setCssProps } from '../utils/bem';

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
		this.datePrecision = task.datePrecision ? { ...task.datePrecision } : {};
		this.selectedTags = task.tags || [];
	}

	onOpen(): void {
		this.renderModalContent(i18n.t('modals.editTask.title'));
	}

	// ==================== 实现抽象方法 ====================

	/**
	 * 渲染任务描述板块
	 */
	protected renderDescriptionSection(container: HTMLElement): void {
		if (!this.allowEditContent) {
			return;
		}

		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const descContainer = section.createDiv(EditTaskModalClasses.elements.descContainer);
		descContainer.createEl('label', {
			text: i18n.t('modals.editTask.descriptionLabel'),
			cls: EditTaskModalClasses.elements.sectionLabel
		});
		descContainer.createEl('div', {
			text: i18n.t('modals.editTask.submitHint'),
			cls: EditTaskModalClasses.elements.sectionHint
		});

		const textArea = descContainer.createEl('textarea', {
			cls: EditTaskModalClasses.elements.descTextarea
		});
		textArea.value = this.task.description || '';

		// Enter 键触发保存
		textArea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				void this.saveTask();
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
			const updates: TaskUpdates = {};

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

			// 合并 datePrecision 到原始任务对象，以便序列化时知道是否输出时间
			if (this.datesChanged) {
				this.task.datePrecision = { ...this.datePrecision };
			}
			await updateTaskProperties(this.app, this.task, updates, this.enabledFormats);
			this.onSuccess();
			this.close();
			new Notice(i18n.t('modals.editTask.success'));
		} catch (err) {
			Logger.error('editTask', 'Failed to update task', err);
			new Notice(i18n.t('modals.editTask.error'));
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
		return { cancel: i18n.t('common.cancel'), save: i18n.t('common.save') };
	}

	// ==================== 重写基类方法 ====================

	/**
	 * 重写 renderPrioritySection 以跟踪优先级变化
	 */
	protected renderPrioritySection(container: HTMLElement): void {
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const priorityContainer = section.createDiv(EditTaskModalClasses.elements.priorityContainer);
		priorityContainer.createEl('label', {
			text: i18n.t('modals.editTask.priorityLabel'),
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
	 * 包装 onChange 回调，在每次变更时设置 datesChanged 标志
	 */
	protected renderDateField(
		container: HTMLElement,
		label: string,
		current: Date | null,
		onChange: (d: Date | null) => void,
		fieldKey?: string
	): void {
		super.renderDateField(container, label, current, (d) => {
			onChange(d);
			this.datesChanged = true;
		}, fieldKey);
	}

	/**
	 * 重写 renderTagsSection 以跟踪标签变化
	 */
	protected renderTagsSection(container: HTMLElement): void {
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
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const repeatContainer = section.createDiv(EditTaskModalClasses.elements.repeatSection);

		// 可点击的折叠标题行
		const headerRow = repeatContainer.createDiv();
		headerRow.addClass('gc-u-flex-between', 'gc-u-pointer', 'gc-u-p-sm');

		const headerLeft = headerRow.createDiv();
		headerLeft.addClass('gc-u-flex-center', 'gc-u-gap-sm');

		const toggleIcon = headerLeft.createEl('span');
		toggleIcon.addClass('gc-u-transition');
		setIcon(toggleIcon, 'chevron-right');

		headerLeft.createEl('label', {
			text: i18n.t('modals.editTask.recurrenceLabel'),
			cls: EditTaskModalClasses.elements.sectionLabel
		});
		setCssProps(headerLeft.querySelector('label')!, { marginBottom: '0' });

		const repeatSummary = headerLeft.createEl('span', {
			text: i18n.t('common.recurrence.none'),
		});
		repeatSummary.addClass('gc-u-text-sm', 'gc-u-text-muted');

		let isExpanded = false;
		const repeatGrid = repeatContainer.createDiv(EditTaskModalClasses.elements.repeatGrid);
		repeatGrid.addClass('gc-u-hidden');

		headerRow.addEventListener('click', (e) => {
			if ((e.target as HTMLElement).tagName === 'BUTTON') return;
			isExpanded = !isExpanded;
			setCssProps(repeatGrid, { display: isExpanded ? 'block' : 'none' });
			setCssProps(toggleIcon, { transform: isExpanded ? 'rotate(90deg)' : '' });
			setCssProps(headerRow, { marginBottom: isExpanded ? '12px' : '0' });
		});

		const clearBtn = headerRow.createEl('button', {
			cls: EditTaskModalClasses.elements.repeatClearBtn,
			text: '× 清除'
		});
		clearBtn.addClass('gc-u-p-xs', 'gc-u-text-sm', 'gc-u-text-muted', 'gc-u-hidden');
		// ========== 频率选择行：每 [间隔输入] [单位下拉] [自定义输入] ==========
		const freqSelectRow = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatRow);
		freqSelectRow.addClass('gc-u-flex-center', 'gc-u-flex-wrap');
		setCssProps(freqSelectRow, { gap: '8px', marginBottom: '12px' });

		freqSelectRow.createEl('span', { text: i18n.t('common.recurrence.every') });

		const intervalInput = freqSelectRow.createEl('input', {
			type: 'number',
			value: '1',
			cls: EditTaskModalClasses.elements.repeatIntervalInput
		});
		intervalInput.min = '1';
		setCssProps(intervalInput, { width: '60px', padding: '4px 8px' });

		const freqSelect = freqSelectRow.createEl('select', {
			cls: EditTaskModalClasses.elements.repeatFreqSelect
		});
		setCssProps(freqSelect, { padding: '4px 8px' });

		const freqOptions = [
			{ value: '', label: i18n.t('common.recurrence.none') },
			{ value: 'daily', label: i18n.t('common.recurrence.day') },
			{ value: 'weekly', label: i18n.t('common.recurrence.week') },
			{ value: 'monthly', label: i18n.t('common.recurrence.month') },
			{ value: 'yearly', label: i18n.t('common.recurrence.year') },
			{ value: 'custom', label: i18n.t('common.recurrence.custom') },
		];
		freqOptions.forEach(opt => {
			freqSelect.createEl('option', { value: opt.value, text: opt.label });
		});

		// ========== 自定义规则输入（选择"自定义"时显示，在同一行） ==========
		const manualInput = freqSelectRow.createEl('input', {
			type: 'text',
			placeholder: i18n.t('modals.editTask.repeat.customPlaceholder'),
			cls: EditTaskModalClasses.elements.repeatManualInput
		});
		manualInput.addClass('gc-u-hidden');
		setCssProps(manualInput, { flex: '1', minWidth: '200px', padding: '4px 8px' });

		// ========== 每周模式：星期选择按钮（默认隐藏，在同一行） ==========
		const weeklyDaysContainer = freqSelectRow.createSpan(EditTaskModalClasses.elements.repeatDaysContainer);
		weeklyDaysContainer.addClass('gc-u-hidden', 'gc-u-items-center', 'gc-u-gap-xs');

		weeklyDaysContainer.createSpan({ text: '  ' });
		const dayButtons: HTMLButtonElement[] = [];
		const dayNames = i18n.t("modals.editTask.repeat.weekdays") as unknown as string[];
		dayNames.forEach((dayName) => {
			const dayBtn = weeklyDaysContainer.createEl('button', {
				cls: EditTaskModalClasses.elements.repeatDayCheckbox,
				text: dayName
			});
			dayBtn.type = 'button';
			dayBtn.addClass('gc-u-pointer', 'gc-u-text-sm');
			setCssProps(dayBtn, { padding: '4px 6px', minWidth: '28px', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', backgroundColor: 'var(--background-secondary)' });

			dayBtn.addEventListener('click', () => {
				dayBtn.classList.toggle('active');
				if (dayBtn.classList.contains('active')) {
					setCssProps(dayBtn, { backgroundColor: 'var(--interactive-accent)', color: 'var(--text-on-accent)', borderColor: 'var(--interactive-accent)' });
				} else {
					setCssProps(dayBtn, { backgroundColor: 'var(--background-secondary)', color: 'var(--text-normal)', borderColor: 'var(--background-modifier-border)' });
				}
				updateRepeat();
			});

			dayButtons.push(dayBtn);
		});

		// ========== 每月模式：日期选择输入框（默认隐藏，在同一行） ==========
		const monthlyDayContainer = freqSelectRow.createSpan(EditTaskModalClasses.elements.repeatMonthContainer);
		monthlyDayContainer.addClass('gc-u-hidden', 'gc-u-items-center', 'gc-u-gap-xs');

		monthlyDayContainer.createSpan({ text: '  ' });
		const monthDayInput = monthlyDayContainer.createEl('input', {
			type: 'number',
			cls: EditTaskModalClasses.elements.repeatMonthSelect,
			placeholder: i18n.t('modals.editTask.repeat.monthlyDayPlaceholder')
		});
		monthDayInput.min = '1';
		monthDayInput.max = '31';
		setCssProps(monthDayInput, { width: '60px', padding: '4px 6px', fontSize: 'var(--font-ui-small)' });

		// ========== 重复方式选择 ==========
		const whenDoneRow = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatWhenDoneContainer);
		whenDoneRow.addClass('gc-u-flex-center', 'gc-u-gap-sm');
		setCssProps(whenDoneRow, { marginBottom: '12px' });

		whenDoneRow.createEl('span', { text: i18n.t('modals.editTask.repeat.modeLabel') });
		setCssProps(whenDoneRow, { fontSize: 'var(--font-ui-small)', color: 'var(--text-muted)' });

		const whenDoneToggle = whenDoneRow.createEl('input', {
			type: 'radio',
			cls: EditTaskModalClasses.elements.repeatWhenDoneToggle
		});
		whenDoneToggle.setAttribute('name', 'repeat-type');
		whenDoneToggle.id = 'repeat-fixed';
		whenDoneToggle.checked = true;

		const fixedLabel = whenDoneRow.createEl('label', {
			text: i18n.t('modals.editTask.repeat.fixedDate')
		});
		fixedLabel.setAttribute('for', 'repeat-fixed');
		setCssProps(fixedLabel, { fontSize: 'var(--font-ui-small)' });

		const whenDoneToggle2 = whenDoneRow.createEl('input', {
			type: 'radio',
			cls: EditTaskModalClasses.elements.repeatWhenDoneToggle
		});
		whenDoneToggle2.setAttribute('name', 'repeat-type');
		whenDoneToggle2.id = 'repeat-when-done';

		const whenDoneLabel = whenDoneRow.createEl('label', {
			text: i18n.t('modals.editTask.repeat.whenDone')
		});
		whenDoneLabel.setAttribute('for', 'repeat-when-done');
		setCssProps(whenDoneLabel, { fontSize: 'var(--font-ui-small)' });
		whenDoneLabel.setAttribute('title', i18n.t('modals.editTask.repeat.whenDoneTooltip'));

		// ========== 预览摘要区域 ==========
		const previewBox = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatPreview);
		previewBox.addClass('gc-u-flex-center');
		setCssProps(previewBox, { padding: '8px 12px', backgroundColor: 'var(--background-modifier-hover)', borderRadius: '4px', fontSize: 'var(--font-ui-small)', color: 'var(--text-muted)', marginBottom: '12px', minHeight: '36px' });

		const previewText = previewBox.createEl('span', {
			text: 'No repeat',
			cls: EditTaskModalClasses.elements.repeatPreviewText
		});

		// ========== 规则说明 ==========
		const rulesHint = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatRulesHint);
		setCssProps(rulesHint, { marginTop: '8px', padding: '8px', backgroundColor: 'var(--background-modifier-hover)', borderRadius: '4px', fontSize: 'var(--font-ui-smaller)' });

		const rulesHintTitle = rulesHint.createEl('div', {
			text: i18n.t('modals.editTask.repeat.rulesHintTitle'),
			cls: EditTaskModalClasses.elements.repeatRulesHintTitle
		});
		rulesHintTitle.addClass('gc-u-font-medium');
		setCssProps(rulesHintTitle, { marginBottom: '4px' });

		const rulesHintList = rulesHint.createEl('div', {
			text: i18n.t('modals.editTask.repeat.rulesHintList'),
			cls: EditTaskModalClasses.elements.repeatRulesHintList
		});
		rulesHintList.addClass('gc-u-text-muted');
		setCssProps(rulesHintList, { whiteSpace: 'pre-line' });

		// ========== 错误提示 ==========
		const errorMsg = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatErrorMsg);
		errorMsg.addClass('gc-u-hidden', 'gc-u-text-sm');
		setCssProps(errorMsg, { color: 'var(--text-error)', marginTop: '4px' });

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

			// Update collapsible header summary
			const freqLabels: Record<string,string> = {
				daily: i18n.t('modals.editTask.repeat.frequencies.daily'), weekly: i18n.t('modals.editTask.repeat.frequencies.weekly'), monthly: i18n.t('modals.editTask.repeat.frequencies.monthly'), yearly: i18n.t('modals.editTask.repeat.frequencies.yearly'), custom: i18n.t('modals.editTask.repeat.frequencies.custom')
			};
			if (!freqSelect.value) {
				repeatSummary.textContent = i18n.t('common.recurrence.none');
				setCssProps(clearBtn, { display: 'none' });
			} else {
				const interval = parseInt(intervalInput.value) || 1;
				const label = freqLabels[freqSelect.value] || freqSelect.value;
				repeatSummary.textContent = interval > 1 ? i18n.t('modals.editTask.repeat.intervalTemplate', { interval: String(interval), label }) : label;
				setCssProps(clearBtn, { display: '' });
			}

			const freqValue = freqSelect.value;
			const interval = parseInt(intervalInput.value) || 1;

			// 不重复
			if (!freqValue) {
				this.repeat = null;
				previewText.textContent = 'No repeat';
				setCssProps(manualInput, { display: 'none' });
				setCssProps(weeklyDaysContainer, { display: 'none' });
				setCssProps(monthlyDayContainer, { display: 'none' });
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
						setCssProps(errorMsg, { display: 'none' });
					} else {
						errorMsg.textContent = i18n.t('modals.editTask.repeat.validationError');
						setCssProps(errorMsg, { display: 'block' });
					}
				} else {
					this.repeat = null;
					previewText.textContent = 'No repeat';
				}
				setCssProps(weeklyDaysContainer, { display: 'none' });
				setCssProps(monthlyDayContainer, { display: 'none' });
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
			setCssProps(errorMsg, { display: 'none' });
		};

		// ========== 事件监听 ==========
		// 频率下拉选择变化
		freqSelect.addEventListener('change', () => {
			const value = freqSelect.value;

			// 重置所有特殊选项显示
			setCssProps(manualInput, { display: 'none' });
			setCssProps(weeklyDaysContainer, { display: 'none' });
			setCssProps(monthlyDayContainer, { display: 'none' });

			// 清除星期选择
			dayButtons.forEach(btn => {
				btn.classList.remove('active');
				setCssProps(btn, { backgroundColor: 'var(--background-secondary)', color: 'var(--text-normal)', borderColor: 'var(--background-modifier-border)' });
			});
			monthDayInput.value = '';

			if (value === 'custom') {
				setCssProps(manualInput, { display: 'block' });
				// 预填充简单规则
				const interval = parseInt(intervalInput.value) || 1;
				const whenDone = whenDoneToggle2.checked;
				let defaultRule = interval === 1 ? 'every week' : `every ${interval} weeks`;
				if (whenDone) defaultRule += ' when done';
				manualInput.value = defaultRule;
			} else if (value === 'weekly') {
				setCssProps(weeklyDaysContainer, { display: 'flex' });
			} else if (value === 'monthly') {
				setCssProps(monthlyDayContainer, { display: 'flex' });
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
			setCssProps(manualInput, { display: 'none' });
			setCssProps(weeklyDaysContainer, { display: 'none' });
			setCssProps(monthlyDayContainer, { display: 'none' });
			monthDayInput.value = '';
			dayButtons.forEach(btn => {
				btn.classList.remove('active');
				setCssProps(btn, { backgroundColor: 'var(--background-secondary)', color: 'var(--text-normal)', borderColor: 'var(--background-modifier-border)' });
			});

			this.repeat = null;
			previewText.textContent = 'No repeat';
			setCssProps(errorMsg, { display: 'none' });
				repeatSummary.textContent = i18n.t('common.recurrence.none');
				setCssProps(clearBtn, { display: 'none' });
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
			setCssProps(manualInput, { display: 'none' });
			setCssProps(weeklyDaysContainer, { display: 'none' });
			setCssProps(monthlyDayContainer, { display: 'none' });
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
				setCssProps(manualInput, { display: 'none' });

				// 设置星期选择
				if (config.days && config.days.length > 0) {
					config.days.forEach(dayIdx => {
						if (dayButtons[dayIdx]) {
							dayButtons[dayIdx].classList.add('active');
							setCssProps(dayButtons[dayIdx], { backgroundColor: 'var(--interactive-accent)', color: 'var(--text-on-accent)' });
						}
					});
					setCssProps(weeklyDaysContainer, { display: 'flex' });
				}

				// 设置月份日期选择
				if (config.monthDay && config.monthDay !== 'last' && typeof config.monthDay === 'number') {
					monthDayInput.value = String(config.monthDay);
					setCssProps(monthlyDayContainer, { display: 'flex' });
				} else if (config.monthDay === 'last') {
					monthDayInput.value = 'last';
					setCssProps(monthlyDayContainer, { display: 'flex' });
				}
			} else {
				// 使用自定义模式
				freqSelect.value = 'custom';
				manualInput.value = currentRepeat;
				setCssProps(manualInput, { display: 'block' });
				setCssProps(weeklyDaysContainer, { display: 'none' });
				setCssProps(monthlyDayContainer, { display: 'none' });
			}

			// 更新预览
			updateRepeat();
		} else {
			// 无法解析的规则，使用自定义模式
			freqSelect.value = 'custom';
			manualInput.value = currentRepeat;
			setCssProps(manualInput, { display: 'block' });
			setCssProps(weeklyDaysContainer, { display: 'none' });
			setCssProps(monthlyDayContainer, { display: 'none' });
			whenDoneToggle2.checked = currentRepeat.toLowerCase().includes('when done');
			updateRepeat();
		}
	}

	// ==================== EditTaskModal 特有方法 ====================

	/**
	 * 获取所有任务（用于推荐标签）
	 */
	private getAllTasks(): GCTask[] {
		// Access Obsidian internal plugin API (not in public types)
		/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
		const plugin: any = (this.app as any).plugins.plugins['gantt-calendar'];
		if (plugin?.taskCache) {
			return plugin.taskCache.getAllTasks() as GCTask[];
		}
		/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
		return [];
	}
}

// 导出类型
export type { PriorityOption, RepeatConfig } from './BaseTaskModal';

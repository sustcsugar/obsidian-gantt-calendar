/**
 * 任务弹窗基类
 *
 * 提供创建和编辑任务弹窗的共同逻辑，包括：
 * - 优先级设置
 * - 日期设置
 * - 周期设置（repeat）
 * - 标签选择
 * - 样式管理
 *
 * @fileoverview 任务弹窗基类
 * @module modals/BaseTaskModal
 */

import { App, Modal } from 'obsidian';
import type { GCTask } from '../types';
import { EditTaskModalClasses } from '../utils/bem';
import { TagSelector } from '../components/TagSelector';
import { createDate } from '../dateUtils/timezone';

/**
 * 优先级选项
 */
export interface PriorityOption {
	value: 'highest' | 'high' | 'medium' | 'normal' | 'low' | 'lowest';
	label: string;
	icon: string;
}

/**
 * 周期任务配置
 */
export interface RepeatConfig {
	frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | '';
	interval: number;
	days?: number[]; // 每周模式：选中的星期（0=周日, 1=周一, ..., 6=周六）
	monthDay?: number | string; // 每月模式：几号（1-31）或 'last'
	whenDone: boolean;
}

/**
 * 任务弹窗基类
 *
 * 包含创建和编辑任务弹窗的共同逻辑。
 * 子类需要实现抽象方法以提供差异化功能。
 */
export abstract class BaseTaskModal extends Modal {
	// 共同属性
	protected styleEl: HTMLStyleElement;
	protected priority: PriorityOption['value'];
	protected repeat: string | null = null;
	protected createdDate: Date | null = null;
	protected startDate: Date | null = null;
	protected scheduledDate: Date | null = null;
	protected dueDate: Date | null = null;
	protected cancelledDate: Date | null = null;
	protected completionDate: Date | null = null;
	protected datePrecision: Record<string, 'day' | 'time'> = {};
	protected selectedTags: string[] = [];
	protected tagSelector: TagSelector;

	// 优先级选项常量
	protected readonly priorityOptions: PriorityOption[] = [
		{ value: 'highest', label: '最高', icon: '🔺' },
		{ value: 'high', label: '高', icon: '⏫' },
		{ value: 'medium', label: '中', icon: '🔼' },
		{ value: 'normal', label: '普通', icon: '◽' },
		{ value: 'low', label: '低', icon: '🔽' },
		{ value: 'lowest', label: '最低', icon: '⏬' },
	];

	constructor(app: App) {
		super(app);
	}

	// ==================== 抽象方法（由子类实现） ====================

	/**
	 * 渲染任务描述板块
	 * 子类根据创建/编辑场景实现不同的描述编辑逻辑
	 */
	protected abstract renderDescriptionSection(container: HTMLElement): void;

	/**
	 * 保存任务
	 * 子类根据创建/编辑场景实现不同的保存逻辑
	 */
	protected abstract saveTask(): Promise<void>;

	/**
	 * 获取初始标签列表
	 * 编辑模式返回现有任务的标签，创建模式返回空数组
	 */
	protected abstract getInitialTags(): string[];

	/**
	 * 获取所有任务（用于标签推荐）
	 */
	protected abstract getAllTasksForTags(): GCTask[];

	/**
	 * 获取按钮文本配置
	 */
	protected abstract getButtonTexts(): { cancel: string; save: string };

	/**
	 * 格式化日期为 input[type="date"] 所需格式 (YYYY-MM-DD)
	 * 子类可以覆盖此方法以提供自定义格式化逻辑
	 */
	protected formatDateForInput(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	/**
	 * Format time for input[type="time"] (HH:mm)
	 */
	protected formatTimeForInput(date: Date): string {
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${hours}:${minutes}`;
	}

	/**
	 * Format date+time for input[type="datetime-local"] (YYYY-MM-DDTHH:mm)
	 */
	protected formatDateTimeForInput(date: Date): string {
		return `${this.formatDateForInput(date)}T${this.formatTimeForInput(date)}`;
	}

	// ==================== 生命周期方法 ====================

	/**
	 * 渲染弹窗内容（模板方法）
	 */
	protected renderModalContent(title: string): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass(EditTaskModalClasses.block);

		this.addStyles();

		// 标题（固定在顶部）
		contentEl.createEl('h2', {
			text: title,
			cls: EditTaskModalClasses.elements.title
		});

		// 创建滚动容器
		const scrollContainer = contentEl.createDiv(EditTaskModalClasses.elements.scrollContainer);

		// 1. 任务描述板块
		this.renderDescriptionSection(scrollContainer);

		// 2. 优先级设置板块
		this.renderPrioritySection(scrollContainer);

		// 3. 时间设置板块
		this.renderDatesSection(scrollContainer);

		// 3.5. 周期设置板块
		this.renderRepeatSection(scrollContainer);

		// 4. 标签选择器
		this.renderTagsSection(scrollContainer);

		// 操作按钮（固定在底部）
		this.renderButtons(contentEl);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.removeClass(EditTaskModalClasses.block);

		// 移除样式
		if (this.styleEl && this.styleEl.parentNode) {
			this.styleEl.parentNode.removeChild(this.styleEl);
		}
	}

	// ==================== 优先级设置板块 ====================

	/**
	 * 渲染优先级设置板块
	 */
	protected renderPrioritySection(container: HTMLElement): void {
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
			});
		});
	}

	// ==================== 时间设置板块 ====================

	/**
	 * 渲染时间设置板块
	 */
	protected renderDatesSection(container: HTMLElement): void {
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const dateContainer = section.createDiv(EditTaskModalClasses.elements.datesContainer);
		dateContainer.createEl('label', {
			text: '日期设置',
			cls: EditTaskModalClasses.elements.sectionLabel
		});

		const datesGrid = dateContainer.createDiv(EditTaskModalClasses.elements.datesGrid);

		this.renderDateField(datesGrid, '➕ 创建', this.createdDate, (d) => this.createdDate = d, 'createdDate');
		this.renderDateField(datesGrid, '🛫 开始', this.startDate, (d) => this.startDate = d, 'startDate');
		this.renderDateField(datesGrid, '⏳ 计划', this.scheduledDate, (d) => this.scheduledDate = d, 'scheduledDate');
		this.renderDateField(datesGrid, '📅 截止', this.dueDate, (d) => this.dueDate = d, 'dueDate');
		this.renderDateField(datesGrid, '✅ 完成', this.completionDate, (d) => this.completionDate = d, 'completionDate');
		this.renderDateField(datesGrid, '❌ 取消', this.cancelledDate, (d) => this.cancelledDate = d, 'cancelledDate');
	}

	/**
	 * 渲染单个日期字段（支持动态切换日期/日期时间）
	 */
	protected renderDateField(
		container: HTMLElement,
		label: string,
		current: Date | null,
		onChange: (d: Date | null) => void,
		fieldKey?: string
	): void {
		const dateItem = container.createDiv(EditTaskModalClasses.elements.dateItem);
		dateItem.createEl('label', {
			text: label,
			cls: EditTaskModalClasses.elements.dateLabel
		});

		const inputContainer = dateItem.createDiv(EditTaskModalClasses.elements.dateInputContainer);
		const initialPrecision = fieldKey ? (this.datePrecision[fieldKey] || 'day') : 'day';
		const isTimePrecision = initialPrecision === 'time';

		// 根据精度创建对应类型的 input
		const input = inputContainer.createEl('input', {
			type: isTimePrecision ? 'datetime-local' : 'date',
			cls: EditTaskModalClasses.elements.dateInput
		});

		if (current) {
			input.value = isTimePrecision
				? this.formatDateTimeForInput(current)
				: this.formatDateForInput(current);
		}

		// 时间切换按钮：day精度时显示，点击后切换为 datetime-local
		let timeToggleBtn: HTMLButtonElement | null = null;
		if (!isTimePrecision) {
			timeToggleBtn = inputContainer.createEl('button', {
				cls: EditTaskModalClasses.elements.dateClear,
				text: '+时间'
			});
			timeToggleBtn.style.fontSize = '0.75em';
			timeToggleBtn.style.opacity = '0.6';
			timeToggleBtn.addEventListener('click', () => {
				if (!fieldKey) return;
				this.datePrecision[fieldKey] = 'time';
				// 记录当前日期值
				const currentDateVal = input.value;
				// 替换 input 为 datetime-local 类型
				input.type = 'datetime-local';
				if (currentDateVal) {
					input.value = currentDateVal + 'T00:00';
				}
				// 隐藏切换按钮
				timeToggleBtn!.style.display = 'none';
				input.focus();
				// 触发变更
				if (input.value) {
					const parsed = this.parseDate(input.value);
					if (parsed) onChange(parsed);
				}
			});
		}

		// 值变更处理
		input.addEventListener('change', () => {
			if (!input.value) {
				onChange(null);
				if (fieldKey) this.datePrecision[fieldKey] = 'day';
				return;
			}
			const parsed = this.parseDate(input.value);
			if (parsed) {
				if (fieldKey) {
					this.datePrecision[fieldKey] = input.type === 'datetime-local' ? 'time' : 'day';
				}
				onChange(parsed);
			}
		});

		// 清空按钮
		const clearBtn = inputContainer.createEl('button', {
			cls: EditTaskModalClasses.elements.dateClear,
			text: '×'
		});
		clearBtn.addEventListener('click', () => {
			input.value = '';
			onChange(null);
			if (fieldKey) this.datePrecision[fieldKey] = 'day';
			// 重置为 date 类型，显示时间切换按钮
			if (input.type === 'datetime-local') {
				input.type = 'date';
				if (timeToggleBtn) timeToggleBtn.style.display = '';
			}
		});
	}

	// ==================== 周期设置板块 ====================

	/**
	 * 渲染周期设置板块
	 */
	protected renderRepeatSection(container: HTMLElement): void {
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

		// 初始化当前值（子类可以覆盖此方法）
		this.initRepeatValue(freqSelect, intervalInput, manualInput, whenDoneToggle2, dayButtons, monthDayInput, weeklyDaysContainer, monthlyDayContainer, updateRepeat);
	}

	/**
	 * 初始化 repeat 值（可被子类覆盖）
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
		// 默认实现：不做任何初始化
		// 子类（EditTaskModal）可以覆盖此方法以加载现有任务的 repeat 值
	}

	/**
	 * 解析 repeat 字符串为配置对象
	 */
	protected parseRepeatToConfig(rule: string): RepeatConfig | null {
		const lower = rule.toLowerCase().trim();

		// 解析 when done
		const whenDone = lower.includes('when done');
		const baseRule = lower.replace(/\s*when\s+done\s*$/, '').trim();

		// 星期名称映射
		const dayNameToIndex: Record<string, number> = {
			'sunday': 0,
			'monday': 1,
			'tuesday': 2,
			'wednesday': 3,
			'thursday': 4,
			'friday': 5,
			'saturday': 6
		};

		// 解析 daily
		const dailyMatch = baseRule.match(/^every\s+(\d+)\s*(days|day)$/);
		if (dailyMatch) {
			return { frequency: 'daily', interval: parseInt(dailyMatch[1]), whenDone };
		}
		if (baseRule === 'every day') {
			return { frequency: 'daily', interval: 1, whenDone };
		}
		if (baseRule === 'every weekday') {
			return { frequency: 'daily', interval: 1, whenDone };
		}
		if (baseRule === 'every weekend') {
			return { frequency: 'daily', interval: 1, whenDone };
		}

		// 解析 weekly（带星期）
		const weeklyWithDaysMatch = baseRule.match(/^every\s+(\d+)\s*weeks?\s+on\s+(.+)$/);
		if (weeklyWithDaysMatch) {
			const interval = parseInt(weeklyWithDaysMatch[1]);
			const daysPart = weeklyWithDaysMatch[2].trim();
			// 解析星期列表（如 "monday, wednesday"）
			const dayNames = daysPart.split(',').map(d => d.trim().toLowerCase());
			const days = dayNames.map(name => dayNameToIndex[name]).filter(d => d !== undefined);
			if (days.length > 0) {
				return { frequency: 'weekly', interval, days, whenDone };
			}
		}

		const weeklyWithDaysMatchSimple = baseRule.match(/^every\s+week\s+on\s+(.+)$/);
		if (weeklyWithDaysMatchSimple) {
			const daysPart = weeklyWithDaysMatchSimple[1].trim();
			const dayNames = daysPart.split(',').map(d => d.trim().toLowerCase());
			const days = dayNames.map(name => dayNameToIndex[name]).filter(d => d !== undefined);
			if (days.length > 0) {
				return { frequency: 'weekly', interval: 1, days, whenDone };
			}
		}

		// 解析 weekly（不带星期）
		const weeklyMatch = baseRule.match(/^every\s+(\d+)\s*(weeks|week)$/);
		if (weeklyMatch) {
			return { frequency: 'weekly', interval: parseInt(weeklyMatch[1]), whenDone };
		}
		if (baseRule === 'every week') {
			return { frequency: 'weekly', interval: 1, whenDone };
		}

		// 解析 monthly（带日期）
		const monthlyWithDayMatch = baseRule.match(/^every\s+(\d+)\s*months?\s+on\s+the\s+(\d+)(?:st|nd|rd|th)?$/);
		if (monthlyWithDayMatch) {
			const interval = parseInt(monthlyWithDayMatch[1]);
			const monthDay = parseInt(monthlyWithDayMatch[2]);
			return { frequency: 'monthly', interval, monthDay, whenDone };
		}

		const monthlyWithDayMatchSimple = baseRule.match(/^every\s+month\s+on\s+the\s+(\d+)(?:st|nd|rd|th)?$/);
		if (monthlyWithDayMatchSimple) {
			const monthDay = parseInt(monthlyWithDayMatchSimple[1]);
			return { frequency: 'monthly', interval: 1, monthDay, whenDone };
		}

		// 解析 monthly（带 last）
		const monthlyWithLastMatch = baseRule.match(/^every\s+(\d+)\s*months?\s+on\s+the\s+last$/);
		if (monthlyWithLastMatch) {
			return { frequency: 'monthly', interval: parseInt(monthlyWithLastMatch[1]), monthDay: 'last', whenDone };
		}

		const monthlyWithLastMatchSimple = baseRule.match(/^every\s+month\s+on\s+the\s+last$/);
		if (monthlyWithLastMatchSimple) {
			return { frequency: 'monthly', interval: 1, monthDay: 'last', whenDone };
		}

		// 解析 monthly（不带日期）
		const monthlyMatch = baseRule.match(/^every\s+(\d+)\s*(months|month)$/);
		if (monthlyMatch) {
			return { frequency: 'monthly', interval: parseInt(monthlyMatch[1]), whenDone };
		}
		if (baseRule === 'every month') {
			return { frequency: 'monthly', interval: 1, whenDone };
		}

		// 解析 yearly
		const yearlyMatch = baseRule.match(/^every\s+(\d+)\s*(years|year)$/);
		if (yearlyMatch) {
			return { frequency: 'yearly', interval: parseInt(yearlyMatch[1]), whenDone };
		}
		if (baseRule === 'every year') {
			return { frequency: 'yearly', interval: 1, whenDone };
		}

		return null;
	}

	/**
	 * 构建规则字符串
	 */
	protected buildRepeatRule(config: RepeatConfig): string {
		const { frequency, interval, days, monthDay, whenDone } = config;

		let rule = '';

		// 英文星期名称
		const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		// 英文序数词
		const ordinal = (n: number): string => {
			const s = ['th', 'st', 'nd', 'rd'];
			const v = n % 100;
			return n + (s[(v - 20) % 10] || s[v] || s[0]);
		};

		switch (frequency) {
			case 'daily':
				rule = interval === 1 ? 'every day' : `every ${interval} days`;
				break;
			case 'weekly':
				if (days && days.length > 0) {
					// 有选择具体星期
					const selectedDayNames = days.map(d => dayNames[d]).sort((a, b) =>
						dayNames.indexOf(a) - dayNames.indexOf(b));
					rule = interval === 1
						? `every week on ${selectedDayNames.join(', ')}`
						: `every ${interval} weeks on ${selectedDayNames.join(', ')}`;
				} else {
					// 没有选择具体星期，使用默认的 every week
					rule = interval === 1 ? 'every week' : `every ${interval} weeks`;
				}
				break;
			case 'monthly':
				if (monthDay !== undefined) {
					if (monthDay === 'last') {
						rule = interval === 1 ? 'every month on the last' : `every ${interval} months on the last`;
					} else {
						rule = interval === 1
							? `every month on the ${ordinal(monthDay as number)}`
							: `every ${interval} months on the ${ordinal(monthDay as number)}`;
					}
				} else {
					// 没有选择具体日期，使用默认的 every month
					rule = interval === 1 ? 'every month' : `every ${interval} months`;
				}
				break;
			case 'yearly':
				rule = interval === 1 ? 'every year' : `every ${interval} years`;
				break;
		}

		if (whenDone && rule) {
			rule += ' when done';
		}

		return rule;
	}

	/**
	 * 验证周期规则
	 */
	protected validateRepeatRule(rule: string): boolean {
		if (!rule) return true;
		const trimmed = rule.trim().toLowerCase();
		if (!trimmed.startsWith('every ')) return false;

		// 检查基本结构
		const validEndings = [
			// daily patterns
			/^every\s+day\s*(when\s+done)?$/,
			/^every\s+weekday\s*(when\s+done)?$/,
			/^every\s+weekend\s*(when\s+done)?$/,
			/^every\s+\d+\s+days?\s*(when\s+done)?$/,
			// weekly patterns
			/^every\s+week\s*(when\s+done)?$/,
			/^every\s+\d+\s+weeks?\s*(when\s+done)?$/,
			/^every\s+week\s+on\s+.+\s*(when\s+done)?$/,
			/^every\s+\d+\s+weeks?\s+on\s+.+\s*(when\s+done)?$/,
			// monthly patterns
			/^every\s+month\s*(when\s+done)?$/,
			/^every\s+\d+\s+months?\s*(when\s+done)?$/,
			/^every\s+month\s+on\s+.+\s*(when\s+done)?$/,
			/^every\s+\d+\s+months?\s+on\s+.+\s*(when\s+done)?$/,
			// yearly patterns
			/^every\s+year\s*(when\s+done)?$/,
			/^every\s+\d+\s+years?\s*(when\s+done)?$/,
			/^every\s+\w+\s+on\s+.+\s*(when\s+done)?$/,  // every January on the 15th
		];

		for (const pattern of validEndings) {
			if (pattern.test(trimmed)) return true;
		}

		return false;
	}

	// ==================== 标签选择器板块 ====================

	/**
	 * 渲染标签选择器板块
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
			}
		});
	}

	// ==================== 操作按钮 ====================

	/**
	 * 渲染操作按钮
	 */
	protected renderButtons(container: HTMLElement): void {
		const buttonContainer = container.createDiv(EditTaskModalClasses.elements.buttons);
		const { cancel, save } = this.getButtonTexts();

		const cancelBtn = buttonContainer.createEl('button', { text: cancel });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = buttonContainer.createEl('button', {
			cls: 'mod-cta',
			text: save
		});
		saveBtn.addEventListener('click', async () => {
			await this.saveTask();
		});
	}

	// ==================== 样式管理 ====================

	/**
	 * 添加弹窗样式
	 */
	protected addStyles(): void {
		this.styleEl = document.createElement('style');
		this.styleEl.textContent = `
			.${EditTaskModalClasses.block} {
				width: 100%;
			}

			/* 滚动容器 - 使用负边距让滚动条贴到模态框右边缘 */
			.${EditTaskModalClasses.elements.scrollContainer} {
				max-height: 65vh;
				overflow-y: auto;
				overflow-x: hidden;
				margin-right: -12px;
				padding-right: 12px;
			}

			/* 自定义滚动条样式 */
			.${EditTaskModalClasses.elements.scrollContainer}::-webkit-scrollbar {
				width: 12px;
			}
			.${EditTaskModalClasses.elements.scrollContainer}::-webkit-scrollbar-track {
				background: transparent;
			}
			.${EditTaskModalClasses.elements.scrollContainer}::-webkit-scrollbar-thumb {
				background: var(--background-modifier-border);
				border-radius: 6px;
				border: 2px solid transparent;
				background-clip: content-box;
			}
			.${EditTaskModalClasses.elements.scrollContainer}::-webkit-scrollbar-thumb:hover {
				background: var(--text-muted);
				background-clip: content-box;
			}

			.${EditTaskModalClasses.elements.title} {
				font-size: var(--font-ui-large);
				font-weight: 600;
				margin-bottom: 20px;
				color: var(--text-normal);
			}
			.${EditTaskModalClasses.elements.section} {
				margin-bottom: 20px;
			}
			.${EditTaskModalClasses.elements.sectionLabel} {
				display: block;
				font-weight: 600;
				margin-bottom: 8px;
				font-size: var(--font-ui-small);
				color: var(--text-normal);
			}
			.${EditTaskModalClasses.elements.sectionHint} {
				font-size: var(--font-ui-smaller);
				color: var(--text-muted);
				margin-bottom: 8px;
			}

			/* 任务描述板块 */
			.${EditTaskModalClasses.elements.descTextarea} {
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
			.${EditTaskModalClasses.elements.descTextarea}:focus {
				outline: 2px solid var(--interactive-accent);
				border-color: var(--interactive-accent);
			}

			/* 优先级板块 */
			.${EditTaskModalClasses.elements.priorityGrid} {
				display: grid;
				grid-template-columns: repeat(3, 1fr);
				gap: 8px;
				margin-top: 8px;
			}
			.${EditTaskModalClasses.elements.priorityBtn} {
				padding: 8px 12px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				color: var(--text-normal);
				cursor: pointer;
				font-size: var(--font-ui-small);
				transition: all 0.2s;
			}
			.${EditTaskModalClasses.elements.priorityBtn}:hover {
				background: var(--background-modifier-hover);
			}
			.${EditTaskModalClasses.elements.priorityBtnSelected} {
				background: var(--interactive-accent) !important;
				color: var(--text-on-accent) !important;
				border-color: var(--interactive-accent) !important;
			}

			/* 日期板块 */
			.${EditTaskModalClasses.elements.datesGrid} {
				display: grid;
				grid-template-columns: repeat(2, 1fr);
				gap: 12px;
			}
			.${EditTaskModalClasses.elements.dateItem} {
				display: flex;
				flex-direction: column;
				gap: 4px;
			}
			.${EditTaskModalClasses.elements.dateLabel} {
				font-size: var(--font-ui-smaller);
				color: var(--text-muted);
				font-weight: 500;
			}
			.${EditTaskModalClasses.elements.dateInputContainer} {
				display: flex;
				gap: 4px;
				align-items: center;
			}
			.${EditTaskModalClasses.elements.dateInput} {
				flex: 1;
				padding: 6px 8px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				color: var(--text-normal);
				font-size: var(--font-ui-small);
			}
			.${EditTaskModalClasses.elements.dateInput}:focus {
				outline: 2px solid var(--interactive-accent);
				border-color: var(--interactive-accent);
			}
			.${EditTaskModalClasses.elements.dateClear} {
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
			.${EditTaskModalClasses.elements.dateClear}:hover {
				background: var(--background-modifier-hover);
				color: var(--text-normal);
			}

			/* 标签选择器板块 */
			.${EditTaskModalClasses.elements.tagsSection} {
				margin-top: 8px;
			}

			/* 标签选择器样式 */
			.gc-tag-selector-label {
				display: block;
				font-weight: 600;
				margin-bottom: 8px;
				font-size: var(--font-ui-small);
				color: var(--text-normal);
			}
			.gc-tag-selector-recommended-section,
			.gc-tag-selector-selected-section {
				margin-bottom: 12px;
			}
			.gc-tag-selector-grid {
				display: flex;
				flex-wrap: wrap;
				gap: 6px;
				margin-top: 6px;
			}
			.gc-tag-selector-new-section {
				display: flex;
				gap: 6px;
				margin-top: 8px;
			}
			.gc-tag-selector-new-input {
				flex: 1;
				padding: 6px 10px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				color: var(--text-normal);
				font-size: var(--font-ui-small);
			}
			.gc-tag-selector-new-input:focus {
				outline: 2px solid var(--interactive-accent);
				border-color: var(--interactive-accent);
			}
			.gc-tag-selector-new-button {
				padding: 6px 12px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				color: var(--text-normal);
				cursor: pointer;
				font-size: var(--font-ui-small);
			}
			.gc-tag-selector-new-button:hover {
				background: var(--background-modifier-hover);
			}

			/* 操作按钮 */
			.${EditTaskModalClasses.elements.buttons} {
				display: flex;
				gap: 12px;
				justify-content: flex-end;
				margin-top: 24px;
			}
			.${EditTaskModalClasses.elements.buttons} button {
				padding: 8px 16px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				color: var(--text-normal);
				cursor: pointer;
				font-size: var(--font-ui-small);
			}
			.${EditTaskModalClasses.elements.buttons} button:hover {
				background: var(--background-modifier-hover);
			}
			.${EditTaskModalClasses.elements.buttons} button.mod-cta {
				background: var(--interactive-accent);
				color: var(--text-on-accent);
				border-color: var(--interactive-accent);
			}
			.${EditTaskModalClasses.elements.buttons} button.mod-cta:hover {
				background: var(--interactive-accent-hover);
			}
		`;
		document.head.appendChild(this.styleEl);
	}

	// ==================== 工具方法 ====================

	/**
	 * 解析日期字符串
	 */
	protected parseDate(dateStr: string): Date | null {
		// 支持 YYYY-MM-DD 和 YYYY-MM-DDTHH:mm 两种格式
		const datetimeMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
		if (datetimeMatch) {
			const date = createDate(`${datetimeMatch[1]}-${datetimeMatch[2]}-${datetimeMatch[3]}`);
			if (isNaN(date.getTime())) return null;
			date.setHours(parseInt(datetimeMatch[4]), parseInt(datetimeMatch[5]), 0, 0);
			return date;
		}
		const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (!match) return null;
		const date = createDate(dateStr);
		return isNaN(date.getTime()) ? null : date;
	}
}

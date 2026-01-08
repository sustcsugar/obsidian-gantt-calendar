/**
 * 任务创建弹窗
 *
 * 提供快速创建任务的界面，支持：
 * - 任务描述（必填）
 * - 优先级选择（可选）
 * - 日期字段（默认为当天）
 * - 智能标签推荐
 */

import { App, Modal, Notice, TextAreaComponent, TextComponent, ButtonComponent } from 'obsidian';
import type GanttCalendarPlugin from '../../main';
import type { GCTask } from '../types';
import { createTaskInDailyNote, type CreateTaskData } from '../utils/dailyNoteHelper';
import { CreateTaskModalClasses } from '../utils/bem';

/**
 * 任务创建弹窗选项
 */
export interface CreateTaskModalOptions {
	app: App;
	plugin: GanttCalendarPlugin;
	targetDate?: Date;
	onSuccess: () => void;
}

/**
 * 任务创建弹窗
 */
export class CreateTaskModal extends Modal {
	private plugin: GanttCalendarPlugin;
	private targetDate: Date;
	private onSuccess: () => void;

	// 表单状态
	private description: string = '';
	private priority: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal' = 'normal';
	private createdDate: Date;
	private dueDate: Date;
	private selectedTags: Set<string> = new Set();

	// UI 组件引用
	private descriptionInput: HTMLTextAreaElement;
	private prioritySelect: HTMLSelectElement;
	private createdDateInput: HTMLInputElement;
	private dueDateInput: HTMLInputElement;
	private tagsContainer: HTMLElement;
	private newTagInput: HTMLInputElement;

	constructor(options: CreateTaskModalOptions) {
		super(options.app);
		this.plugin = options.plugin;
		this.targetDate = options.targetDate || new Date();
		this.onSuccess = options.onSuccess;

		this.createdDate = this.targetDate;
		this.dueDate = this.targetDate;

		// 设置默认优先级（默认为 normal）
		this.priority = this.plugin.settings.defaultTaskPriority || 'normal';
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass(CreateTaskModalClasses.block);

		// 标题
		contentEl.createEl('h2', { text: '创建新任务' });

		// 表单容器
		const form = contentEl.createDiv(CreateTaskModalClasses.elements.form);

		// 渲染表单字段
		this.renderDescriptionField(form);
		this.renderPriorityField(form);
		this.renderDateFields(form);
		this.renderTagSelector(form);
		this.renderButtons(contentEl);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.removeClass(CreateTaskModalClasses.block);
	}

	/**
	 * 渲染描述字段
	 */
	private renderDescriptionField(container: HTMLElement): void {
		const field = container.createDiv(CreateTaskModalClasses.elements.field);
		field.createEl('label', {
			text: '描述 *',
			cls: CreateTaskModalClasses.elements.label
		});

		const textarea = new TextAreaComponent(field);
		textarea.inputEl.addClass(CreateTaskModalClasses.elements.textarea);
		textarea.setPlaceholder('输入任务描述...');
		textarea.inputEl.rows = 3;
		this.descriptionInput = textarea.inputEl;
		this.descriptionInput.focus();
	}

	/**
	 * 渲染优先级字段
	 */
	private renderPriorityField(container: HTMLElement): void {
		const field = container.createDiv(CreateTaskModalClasses.elements.field);
		field.createEl('label', {
			text: '优先级',
			cls: CreateTaskModalClasses.elements.label
		});

		const select = field.createEl('select', {
			cls: CreateTaskModalClasses.elements.input
		});

		const options = {
			highest: '🔺 最高',
			high: '⏫ 高',
			medium: '🔼 中',
			normal: '◽ 普通',
			low: '🔽 低',
			lowest: '⏬ 最低',
		};

		Object.entries(options).forEach(([value, label]) => {
			const option = select.createEl('option', { value, text: label });
			if (value === this.priority) {
				option.selected = true;
			}
		});

		select.addEventListener('change', () => {
			this.priority = select.value as any;
		});

		this.prioritySelect = select;
	}

	/**
	 * 渲染日期字段
	 */
	private renderDateFields(container: HTMLElement): void {
		const dateContainer = container.createDiv(CreateTaskModalClasses.elements.field);

		// 创建日期
		const createdField = dateContainer.createDiv();
		createdField.createEl('label', {
			text: '创建日期',
			cls: CreateTaskModalClasses.elements.label
		});

		this.createdDateInput = createdField.createEl('input', {
			type: 'date',
			cls: CreateTaskModalClasses.elements.input
		});
		this.createdDateInput.value = this.formatDateForInput(this.createdDate);
		this.createdDateInput.addEventListener('change', () => {
			if (this.createdDateInput.value) {
				this.createdDate = new Date(this.createdDateInput.value);
			}
		});

		// 截止日期
		const dueField = dateContainer.createDiv();
		dueField.createEl('label', {
			text: '截止日期',
			cls: CreateTaskModalClasses.elements.label
		});

		this.dueDateInput = dueField.createEl('input', {
			type: 'date',
			cls: CreateTaskModalClasses.elements.input
		});
		this.dueDateInput.value = this.formatDateForInput(this.dueDate);
		this.dueDateInput.addEventListener('change', () => {
			if (this.dueDateInput.value) {
				this.dueDate = new Date(this.dueDateInput.value);
			}
		});
	}

	/**
	 * 渲染标签选择器
	 */
	private renderTagSelector(container: HTMLElement): void {
		const field = container.createDiv(CreateTaskModalClasses.elements.field);
		field.createEl('label', {
			text: '标签',
			cls: CreateTaskModalClasses.elements.label
		});

		this.tagsContainer = field.createDiv(CreateTaskModalClasses.elements.tagsContainer);

		// 推荐标签区域
		const recommendedSection = this.tagsContainer.createDiv();
		recommendedSection.createEl('small', { text: '推荐标签：' });

		const recommendedTags = this.getRecommendedTags();
		const tagsContainer = recommendedSection.createDiv();
		(tagsContainer as any).style.display = 'flex';
		(tagsContainer as any).style.flexWrap = 'wrap';
		(tagsContainer as any).style.gap = '6px';
		(tagsContainer as any).style.marginTop = '6px';

		recommendedTags.forEach(tag => {
			const tagEl = tagsContainer.createEl('span', {
				text: `#${tag}`,
				cls: CreateTaskModalClasses.elements.tagItem
			});

			tagEl.addEventListener('click', () => {
				if (this.selectedTags.has(tag)) {
					this.selectedTags.delete(tag);
					tagEl.removeClass(CreateTaskModalClasses.elements.tagItemSelected);
				} else {
					this.selectedTags.add(tag);
					tagEl.addClass(CreateTaskModalClasses.elements.tagItemSelected);
				}
			});
		});

		// 已选标签区域
		const selectedSection = this.tagsContainer.createDiv();
		selectedSection.createEl('small', { text: '已选标签：' });

		const selectedTagsContainer = selectedSection.createDiv();
		(selectedTagsContainer as any).style.display = 'flex';
		(selectedTagsContainer as any).style.flexWrap = 'wrap';
		(selectedTagsContainer as any).style.gap = '6px';
		(selectedTagsContainer as any).style.marginTop = '6px';

		this.updateSelectedTagsDisplay = () => {
			selectedTagsContainer.empty();
			this.selectedTags.forEach(tag => {
				const tagEl = selectedTagsContainer.createEl('span', {
					text: `#${tag} ×`,
					cls: CreateTaskModalClasses.elements.tagItemSelected
				});
				tagEl.addEventListener('click', () => {
					this.selectedTags.delete(tag);
					this.updateSelectedTagsDisplay();
				});
			});
		};

		// 新建标签输入
		const newTagSection = this.tagsContainer.createDiv();
		(newTagSection as any).style.display = 'flex';
		(newTagSection as any).style.gap = '6px';
		(newTagSection as any).style.marginTop = '8px';

		const input = new TextComponent(newTagSection);
		input.inputEl.addClass(CreateTaskModalClasses.elements.tagInput);
		input.setPlaceholder('新建标签...');
		this.newTagInput = input.inputEl;

		const addButton = new ButtonComponent(newTagSection);
		addButton.setButtonText('添加');
		addButton.onClick(() => {
			const newTag = this.newTagInput.value.trim().replace(/^#/, '');
			if (newTag && !this.selectedTags.has(newTag)) {
				this.selectedTags.add(newTag);
				this.updateSelectedTagsDisplay();
				this.newTagInput.value = '';
			}
		});
	}

	private updateSelectedTagsDisplay: () => void = () => {};

	/**
	 * 渲染按钮
	 */
	private renderButtons(container: HTMLElement): void {
		const buttons = container.createDiv(CreateTaskModalClasses.elements.buttons);

		// 取消按钮
		const cancelButton = new ButtonComponent(buttons);
		cancelButton.setButtonText('取消');
		cancelButton.onClick(() => {
			this.close();
		});

		// 创建按钮
		const createButton = new ButtonComponent(buttons);
		createButton.setButtonText('创建');
		createButton.setCta();
		createButton.onClick(() => {
			this.saveTask();
		});
	}

	/**
	 * 保存任务
	 */
	private async saveTask(): Promise<void> {
		// 验证描述
		const description = this.descriptionInput.value.trim();
		if (!description) {
			new Notice('请输入任务描述');
			return;
		}

		// 验证日期
		if (this.createdDate > this.dueDate) {
			new Notice('创建日期不能晚于截止日期');
			return;
		}

		try {
			const taskData: CreateTaskData = {
				description,
				priority: this.priority,
				createdDate: this.createdDate,
				dueDate: this.dueDate,
				tags: Array.from(this.selectedTags)
			};

			await createTaskInDailyNote(this.app, taskData, this.plugin.settings);

			new Notice('任务创建成功');
			this.onSuccess();
			this.close();
		} catch (error) {
			console.error('[CreateTaskModal] Error creating task:', error);
			new Notice('创建任务失败: ' + (error as Error).message);
		}
	}

	/**
	 * 获取推荐标签（基于频率）
	 */
	private getRecommendedTags(): string[] {
		const allTasks: GCTask[] = this.plugin.taskCache.getAllTasks();
		const frequency = new Map<string, number>();

		allTasks.forEach(task => {
			task.tags?.forEach(tag => {
				frequency.set(tag, (frequency.get(tag) || 0) + 1);
			});
		});

		return Array.from(frequency.entries())
			.sort((a, b) => b[1] - a[1])  // 按频率降序
			.slice(0, 10)  // 最多显示10个
			.map(([tag]) => tag);
	}

	/**
	 * 格式化日期为 input[type="date"] 所需格式 (YYYY-MM-DD)
	 */
	private formatDateForInput(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}
}

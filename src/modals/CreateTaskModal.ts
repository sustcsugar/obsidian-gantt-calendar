/**
 * 任务创建弹窗
 *
 * 提供快速创建任务的界面，基于 BaseTaskModal 基类。
 *
 * @fileoverview 任务创建弹窗
 * @module modals/CreateTaskModal
 */

import { App, Notice } from 'obsidian';
import type GanttCalendarPlugin from '../../main';
import type { CreateTaskData } from '../utils/dailyNoteHelper';
import { createTaskInDailyNote } from '../utils/dailyNoteHelper';
import { Logger } from '../utils/logger';
import type { GCTask } from '../types';
import { BaseTaskModal, type PriorityOption } from './BaseTaskModal';

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
export class CreateTaskModal extends BaseTaskModal {
	private plugin: GanttCalendarPlugin;
	private targetDate: Date;
	private onSuccess: () => void;

	// 独有状态
	private descriptionInput: HTMLTextAreaElement;

	constructor(options: CreateTaskModalOptions) {
		super(options.app);
		this.plugin = options.plugin;
		this.targetDate = options.targetDate || new Date();
		this.onSuccess = options.onSuccess;

		// 默认值：创建时间和截止时间为当天，其他时间为空
		this.createdDate = new Date(this.targetDate);
		this.createdDate.setHours(0, 0, 0, 0);
		this.dueDate = new Date(this.targetDate);
		this.dueDate.setHours(0, 0, 0, 0);
		this.startDate = null;
		this.scheduledDate = null;
		this.cancelledDate = null;
		this.completionDate = null;

		// 默认优先级
		this.priority = this.plugin.settings.defaultTaskPriority || 'normal';
	}

	onOpen(): void {
		this.renderModalContent('创建新任务');

		// 自动聚焦到描述输入框
		setTimeout(() => this.descriptionInput.focus(), 100);
	}

	// ==================== 实现抽象方法 ====================

	/**
	 * 渲染任务描述板块
	 */
	protected renderDescriptionSection(container: HTMLElement): void {
		const { EditTaskModalClasses } = require('../utils/bem') as typeof import('../utils/bem');
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const descContainer = section.createDiv(EditTaskModalClasses.elements.descContainer);
		descContainer.createEl('label', {
			text: '任务描述 *',
			cls: EditTaskModalClasses.elements.sectionLabel
		});
		descContainer.createEl('div', {
			text: '按 Enter 键可快捷提交',
			cls: EditTaskModalClasses.elements.sectionHint
		});

		this.descriptionInput = descContainer.createEl('textarea', {
			cls: EditTaskModalClasses.elements.descTextarea
		});
		this.descriptionInput.placeholder = '输入任务描述...';

		// Enter 键触发创建
		this.descriptionInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.saveTask();
			}
		});
	}

	/**
	 * 保存任务
	 */
	protected async saveTask(): Promise<void> {
		// 验证描述
		const description = this.descriptionInput.value.trim().replace(/[\r\n]+/g, ' ');
		if (!description) {
			new Notice('请输入任务描述');
			this.descriptionInput.focus();
			return;
		}

		// 验证日期
		if (this.createdDate && this.dueDate && this.createdDate > this.dueDate) {
			new Notice('创建日期不能晚于截止日期');
			return;
		}

		try {
			const taskData: CreateTaskData = {
				description,
				priority: this.priority === 'normal' ? undefined : this.priority,
				repeat: this.repeat || undefined,
				createdDate: this.createdDate!,
				startDate: this.startDate,
				scheduledDate: this.scheduledDate,
				dueDate: this.dueDate!,
				completionDate: this.completionDate,
				cancelledDate: this.cancelledDate,
				tags: this.selectedTags.length > 0 ? this.selectedTags : undefined,
				datePrecision: Object.keys(this.datePrecision).length > 0 ? this.datePrecision : undefined
			};

			await createTaskInDailyNote(this.app, taskData, this.plugin.settings, this.plugin.dailyNoteIndex);

			new Notice('任务创建成功');
			this.onSuccess();
			this.close();
		} catch (error) {
			Logger.error('CreateTaskModal', 'Error creating task:', error);
			new Notice('创建任务失败: ' + (error as Error).message);
		}
	}

	/**
	 * 获取初始标签列表（创建任务时为空）
	 */
	protected getInitialTags(): string[] {
		return [];
	}

	/**
	 * 获取所有任务（用于标签推荐）
	 */
	protected getAllTasksForTags(): GCTask[] {
		return this.plugin.taskCache.getAllTasks();
	}

	/**
	 * 获取按钮文本
	 */
	protected getButtonTexts(): { cancel: string; save: string } {
		return { cancel: '取消', save: '创建' };
	}
}

// 导出类型
export type { PriorityOption, RepeatConfig } from './BaseTaskModal';

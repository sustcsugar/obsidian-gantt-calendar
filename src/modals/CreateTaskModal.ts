/**
 * 任务创建弹窗
 *
 * 提供快速创建任务的界面，基于 BaseTaskModal 基类。
 *
 * @fileoverview 任务创建弹窗
 * @module modals/CreateTaskModal
 */

import { App, Notice } from 'obsidian';
import type { IPluginContext } from '../types';
import type { CreateTaskData } from '../utils/dailyNoteHelper';
import { createTaskInDailyNote } from '../utils/dailyNoteHelper';
import { Logger } from '../utils/logger';
import type { GCTask } from '../types';
import { BaseTaskModal } from './BaseTaskModal';
import { i18n } from '../i18n/i18n';
import { EditTaskModalClasses } from '../utils/bem';

/**
 * 任务创建弹窗选项
 */
export interface CreateTaskModalOptions {
	app: App;
	plugin: IPluginContext;
	targetDate?: Date;
	targetHour?: number;
	onSuccess: () => void;
}

/**
 * 任务创建弹窗
 */
export class CreateTaskModal extends BaseTaskModal {
	private plugin: IPluginContext;
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

		// 如果指定了目标小时，预填时间和精度
		if (options.targetHour !== undefined) {
			this.dueDate.setHours(options.targetHour, 0, 0, 0);
			this.datePrecision = { dueDate: 'time' };
		}

		// 默认优先级
		this.priority = this.plugin.settings.defaultTaskPriority || 'normal';
	}

	onOpen(): void {
		this.renderModalContent(i18n.t('modals.createTask.title'));

		// 自动聚焦到描述输入框
		window.setTimeout(() => this.descriptionInput.focus(), 100);
	}

	// ==================== 实现抽象方法 ====================

	/**
	 * 渲染任务描述板块
	 */
	protected renderDescriptionSection(container: HTMLElement): void {
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const descContainer = section.createDiv(EditTaskModalClasses.elements.descContainer);
		descContainer.createEl('label', {
			text: i18n.t('modals.createTask.descriptionLabel'),
			cls: EditTaskModalClasses.elements.sectionLabel
		});
		descContainer.createEl('div', {
			text: i18n.t('modals.createTask.submitHint'),
			cls: EditTaskModalClasses.elements.sectionHint
		});

		this.descriptionInput = descContainer.createEl('textarea', {
			cls: EditTaskModalClasses.elements.descTextarea
		});
		this.descriptionInput.placeholder = i18n.t('modals.createTask.descriptionPlaceholder');

		// Enter 键触发创建
		this.descriptionInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				void this.saveTask();
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
			new Notice(i18n.t('modals.createTask.errorEmptyDescription'));
			this.descriptionInput.focus();
			return;
		}

		// 验证日期
		if (this.createdDate && this.dueDate && this.createdDate > this.dueDate) {
			new Notice(i18n.t('modals.createTask.errorDateOrder'));
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

			new Notice(i18n.t('modals.createTask.success'));
			this.onSuccess();
			this.close();
		} catch (error) {
			Logger.error('CreateTaskModal', 'Error creating task:', error);
			new Notice(i18n.t('modals.createTask.error', { error: (error as Error).message }));
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
		return { cancel: i18n.t('common.cancel'), save: i18n.t('common.add') };
	}
}

// 导出类型
export type { PriorityOption, RepeatConfig } from './BaseTaskModal';

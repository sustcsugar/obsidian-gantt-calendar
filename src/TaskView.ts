import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type GanttCalendarPlugin from '../main';
import { searchTasks, GanttTask, updateTaskCompletion } from './taskManager';
import { openFileInExistingLeaf } from './utils';

export const TASK_VIEW_ID = 'gantt-task-view';

export class TaskView extends ItemView {
	private plugin: GanttCalendarPlugin;
	private listContainer: HTMLElement | null = null;
	private statsContainer: HTMLElement | null = null;
	private cacheUpdateListener: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: GanttCalendarPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return TASK_VIEW_ID;
	}

	getDisplayText(): string {
		return '任务视图';
	}

	getIcon(): string {
		return 'check-circle';
	}

	async onOpen(): Promise<void> {
		this.render();

		// 订阅缓存更新事件
		this.cacheUpdateListener = () => {
			if (this.containerEl.isConnected) {
				this.renderTasks();
			}
		};
		this.plugin.taskCache.onUpdate(this.cacheUpdateListener);
	}

	async onClose(): Promise<void> {
		// 取消订阅
		if (this.cacheUpdateListener) {
			this.plugin.taskCache.offUpdate(this.cacheUpdateListener);
			this.cacheUpdateListener = null;
		}
	}

	public async render(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('gantt-task-view');

		const header = containerEl.createDiv('gantt-task-view-header');
		header.createEl('h2', { text: '任务视图' });

		const actions = header.createDiv('gantt-task-view-actions');
		const refreshBtn = actions.createEl('button', { text: '刷新任务' });
		refreshBtn.addEventListener('click', () => this.renderTasks());

		const filterInfo = containerEl.createDiv('gantt-task-filter-info');
		filterInfo.setText(`当前筛选标记: "${this.plugin.settings.globalTaskFilter || '（未设置）'}"`);

		this.statsContainer = containerEl.createDiv('gantt-task-stats');
		this.listContainer = containerEl.createDiv('gantt-task-list');

		await this.renderTasks();
	}

	public async renderTasks(): Promise<void> {
		if (!this.listContainer || !this.statsContainer) return;

		this.statsContainer.empty();
		this.listContainer.empty();

		this.listContainer.createEl('div', { text: '加载中...', cls: 'gantt-task-empty' });

		try {
			// Get tasks from cache instead of scanning
			const tasks: GanttTask[] = this.plugin.taskCache.getAllTasks();
			this.listContainer.empty();

			const completedCount = tasks.filter(t => t.completed).length;
			this.statsContainer.empty();
			this.statsContainer.createEl('span', { text: `✓ 已完成: ${completedCount}` });
			this.statsContainer.createEl('span', { text: `○ 待完成: ${tasks.length - completedCount}` });

			if (tasks.length === 0) {
				this.listContainer.createEl('div', { text: '未找到符合条件的任务', cls: 'gantt-task-empty' });
				return;
			}

			for (const task of tasks) {
				this.renderTaskItem(task);
			}
		} catch (error) {
			console.error('Error rendering task view', error);
			this.listContainer.empty();
			this.listContainer.createEl('div', { text: '加载任务时出错', cls: 'gantt-task-empty' });
		}
	}

	private renderTaskItem(task: GanttTask): void {
		if (!this.listContainer) return;
		const taskItem = this.listContainer.createDiv('gantt-task-item');
		taskItem.addClass(task.completed ? 'completed' : 'pending');

		const contentDiv = taskItem.createDiv('gantt-task-content');
		const checkbox = contentDiv.createEl('input', { type: 'checkbox', cls: 'gantt-task-checkbox' }) as HTMLInputElement;
		checkbox.checked = task.completed;
		checkbox.disabled = false; // 启用复选框
		
		// 复选框变更事件
		checkbox.addEventListener('change', async (e) => {
			console.log('[TaskView] Checkbox change event triggered', e);
			e.stopPropagation(); // 防止事件冒泡
			const isNowCompleted = checkbox.checked;
			try {
				await updateTaskCompletion(
					this.app,
					task,
					isNowCompleted,
					this.plugin.settings.enabledTaskFormats
				);
				// 更新 UI 状态（视图会自动刷新）
				taskItem.toggleClass('completed', isNowCompleted);
				taskItem.toggleClass('pending', !isNowCompleted);
			} catch (error) {
				console.error('Error updating task:', error);
				new Notice('更新任务失败');
				// 恢复复选框状态
				checkbox.checked = task.completed;
			}
		});

		// 添加 click 事件监听用于调试
		checkbox.addEventListener('click', (e) => {
			console.log('[TaskView] Checkbox click event triggered', e);
			e.stopPropagation();
		});

		contentDiv.createEl('span', { text: task.content, cls: 'gantt-task-text' });

		const infoDiv = taskItem.createDiv('gantt-task-info');
		infoDiv.createEl('span', { text: `${task.fileName} : 第 ${task.lineNumber} 行`, cls: 'gantt-task-file' });

		// 点击文件信息打开文件，但不打开文件信息的其他地方
		infoDiv.addEventListener('click', async (e) => {
			e.stopPropagation();
			await openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
		});
	}
}

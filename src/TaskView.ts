import { ItemView, WorkspaceLeaf } from 'obsidian';
import type GanttCalendarPlugin from '../main';
import { searchTasks, GanttTask } from './taskManager';
import { openFileInExistingLeaf } from './utils';

export const TASK_VIEW_ID = 'gantt-task-view';

export class TaskView extends ItemView {
	private plugin: GanttCalendarPlugin;
	private listContainer: HTMLElement | null = null;
	private statsContainer: HTMLElement | null = null;

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
	}

	async onClose(): Promise<void> {
		// Nothing to clean up for now
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
		const checkbox = contentDiv.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
		checkbox.checked = task.completed;
		checkbox.disabled = true;
		contentDiv.createEl('span', { text: task.content, cls: 'gantt-task-text' });

		const infoDiv = taskItem.createDiv('gantt-task-info');
		infoDiv.createEl('span', { text: `${task.fileName} : 第 ${task.lineNumber} 行`, cls: 'gantt-task-file' });

		taskItem.addEventListener('click', async () => {
			await openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
		});
	}
}

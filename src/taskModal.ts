import { Modal, App } from 'obsidian';
import type { GanttTask } from './taskManager';
import { openFileInExistingLeaf } from './utils';

export class TaskListModal extends Modal {
	tasks: GanttTask[];
	app: App;

	constructor(app: App, tasks: GanttTask[]) {
		super(app);
		this.app = app;
		this.tasks = tasks;
	}

	onOpen() {
		const { contentEl } = this;
		this.modalEl.addClass('gantt-task-modal');
		contentEl.empty();

		// 标题
		contentEl.createEl('h2', { text: `任务列表 (共 ${this.tasks.length} 个)` });

		if (this.tasks.length === 0) {
			contentEl.createEl('p', { 
				text: '未找到符合条件的任务',
				cls: 'gantt-task-empty'
			});
			return;
		}

		// 统计信息
		const completedCount = this.tasks.filter(t => t.completed).length;
		const statsDiv = contentEl.createDiv('gantt-task-stats');
		statsDiv.createEl('span', { text: `✓ 已完成: ${completedCount}` });
		statsDiv.createEl('span', { text: `○ 待完成: ${this.tasks.length - completedCount}` });

		// 任务列表容器
		const listContainer = contentEl.createDiv('gantt-task-list');

		this.tasks.forEach((task, index) => {
			const taskItem = listContainer.createDiv('gantt-task-item');
			taskItem.addClass(task.completed ? 'completed' : 'pending');

			// 任务状态和内容
			const contentDiv = taskItem.createDiv('gantt-task-content');
			
			const checkbox = contentDiv.createEl('input', {
				type: 'checkbox'
			}) as HTMLInputElement;
			checkbox.checked = task.completed;
			checkbox.disabled = true;

			const textSpan = contentDiv.createEl('span', { 
				text: task.content,
				cls: 'gantt-task-text'
			});

			// 文件和行号信息
			const infoDiv = taskItem.createDiv('gantt-task-info');
			infoDiv.createEl('span', { 
				text: `${task.fileName} : 第 ${task.lineNumber} 行`,
				cls: 'gantt-task-file'
			});

			// 点击打开文件
			taskItem.addEventListener('click', async () => {
				await openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
				this.close();
			});
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

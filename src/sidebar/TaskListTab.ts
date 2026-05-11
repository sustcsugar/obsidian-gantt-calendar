import type { App } from 'obsidian';
import { setIcon } from 'obsidian';
import type { GCTask, StatusFilterState } from '../types';
import { DEFAULT_STATUS_FILTER_STATE } from '../types';
import { SidebarClasses } from '../utils/bem';
import { TaskCardComponent, buildSidebarConfig } from '../components/TaskCard';
import { sortTasks } from '../tasks/taskSorter';
import { openFileInExistingLeaf } from '../utils/fileOpener';
import { getStatusByKey, DEFAULT_TASK_STATUSES } from '../tasks/taskStatus';
import { isToday } from '../dateUtils/dateCompare';
import { isThisWeek } from '../dateUtils/week';
import { isThisMonth } from '../dateUtils/dateCompare';
import { Logger } from '../utils/logger';

/**
 * 侧边栏 — 任务列表 Tab
 * 支持搜索、状态筛选、优先级筛选、拖拽
 */
export class TaskListTab {
	private app: App;
	private plugin: any;

	private searchQuery: string = '';
	private statusFilter: StatusFilterState = { ...DEFAULT_STATUS_FILTER_STATE };
	private priorityFilter: string = 'all'; // 'all' | 'highest' | 'high' | 'medium' | 'normal' | 'low' | 'lowest'
	private selectedTags: string[] = [];
	private tagOperator: 'OR' | 'AND' = 'OR';
	private dateFilter: 'all' | 'today' | 'week' | 'month' = 'all';
	private sortBy: 'priority' | 'dueDate' | 'startDate' = 'dueDate';
	private sortOrder: 'asc' | 'desc' = 'asc';

	private debounceTimer: number | null = null;
	private scrollContainer: HTMLElement | null = null;
	private taskListEl: HTMLElement | null = null;
	private cardMap: Map<string, { element: HTMLElement; destroy: () => void }> = new Map();

	constructor(app: App, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}

	render(container: HTMLElement): void {
		this.cardMap.clear();
		this.scrollContainer = container;

		// 搜索框
		const searchContainer = container.createDiv(SidebarClasses.elements.searchInput);
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: '搜索任务...',
		});
		searchInput.value = this.searchQuery;
		searchInput.addEventListener('input', () => {
			if (this.debounceTimer) clearTimeout(this.debounceTimer);
			this.debounceTimer = window.setTimeout(() => {
				this.searchQuery = searchInput.value.trim().toLowerCase();
				this.renderTaskList();
			}, 300);
		});

		// 筛选栏
		const filterBar = container.createDiv(SidebarClasses.elements.filterBar);
		this.renderFilterBar(filterBar);

		// 任务列表
		this.taskListEl = container.createDiv(SidebarClasses.elements.taskList);
		this.renderTaskList();
	}

	refresh(container: HTMLElement): void {
		this.renderTaskList();
	}

	cleanup(): void {
		this.destroyCards();
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
	}

	private renderFilterBar(filterBar: HTMLElement): void {
		// 状态筛选按钮
		const statusBtn = filterBar.createEl('button', { cls: 'clickable-icon' });
		setIcon(statusBtn, 'filter');
		statusBtn.title = '状态筛选';
		statusBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.toggleStatusDropdown(filterBar, statusBtn);
		});

		// 优先级筛选按钮
		const priorityBtn = filterBar.createEl('button', { cls: 'clickable-icon' });
		setIcon(priorityBtn, 'flame');
		priorityBtn.title = '优先级筛选';
		priorityBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.togglePriorityDropdown(filterBar, priorityBtn);
		});

		// 标签筛选按钮
		const tagBtn = filterBar.createEl('button', { cls: 'clickable-icon' });
		setIcon(tagBtn, 'tag');
		tagBtn.title = '标签筛选';
		tagBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.toggleTagDropdown(filterBar, tagBtn);
		});

		// 排序按钮
		const sortBtn = filterBar.createEl('button', { cls: 'clickable-icon' });
		setIcon(sortBtn, 'arrow-up-down');
		sortBtn.title = '排序';
		sortBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.toggleSortDropdown(filterBar, sortBtn);
		});

		// 日期筛选按钮
		const dateBtn = filterBar.createEl('button', { cls: 'clickable-icon' });
		setIcon(dateBtn, 'calendar');
		dateBtn.title = '日期筛选';
		dateBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.toggleDateFilterDropdown(filterBar, dateBtn);
		});

		// 筛选状态指示
		this.updateFilterIndicators(statusBtn, priorityBtn, tagBtn, dateBtn);
	}

	private updateFilterIndicators(statusBtn: HTMLElement, priorityBtn: HTMLElement, tagBtn: HTMLElement, dateBtn: HTMLElement): void {
		const hasStatusFilter = this.statusFilter.selectedStatuses.length > 0;
		statusBtn.toggleClass('has-active-filter', hasStatusFilter);

		const hasPriorityFilter = this.priorityFilter !== 'all';
		priorityBtn.toggleClass('has-active-filter', hasPriorityFilter);

		const hasTagFilter = this.selectedTags.length > 0;
		tagBtn.toggleClass('has-active-filter', hasTagFilter);

		const hasDateFilter = this.dateFilter !== 'all';
		dateBtn.toggleClass('has-active-filter', hasDateFilter);
	}

	private toggleStatusDropdown(container: HTMLElement, anchor: HTMLElement): void {
		const existing = container.querySelector('.sidebar-dropdown');
		if (existing) { existing.remove(); return; }

		const dropdown = container.createDiv('sidebar-dropdown');
		dropdown.style.cssText = 'position:absolute;z-index:100;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:6px;padding:4px;box-shadow:0 2px 8px rgba(0,0,0,0.2);';

		const renderStatusItems = () => {
			dropdown.empty();
			for (const status of DEFAULT_TASK_STATUSES) {
				const isSelected = this.statusFilter.selectedStatuses.includes(status.key);
				const item = dropdown.createDiv('sidebar-dropdown-item');
				item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px;cursor:pointer;border-radius:4px;';
				item.toggleClass('is-selected', isSelected);

				const checkbox = item.createEl('input', { type: 'checkbox' });
				checkbox.checked = isSelected;
				checkbox.style.margin = '0';

				const label = item.createSpan({ text: status.name });
				label.style.cssText = 'font-size:13px;';

				item.addEventListener('click', (e) => {
					e.stopPropagation();
					if (isSelected) {
						this.statusFilter.selectedStatuses = this.statusFilter.selectedStatuses.filter(s => s !== status.key);
					} else {
						this.statusFilter.selectedStatuses.push(status.key);
					}
					this.renderTaskList();
					renderStatusItems();
				});
			}
		};

		renderStatusItems();

		// 点击外部关闭
		const closeHandler = (e: MouseEvent) => {
			if (!dropdown.contains(e.target as Node)) {
				dropdown.remove();
				document.removeEventListener('click', closeHandler);
			}
		};
		setTimeout(() => document.addEventListener('click', closeHandler), 0);
	}

	private togglePriorityDropdown(container: HTMLElement, anchor: HTMLElement): void {
		const existing = container.querySelector('.sidebar-dropdown');
		if (existing) { existing.remove(); return; }

		const priorities = [
			{ key: 'all', label: '全部' },
			{ key: 'highest', label: '最高' },
			{ key: 'high', label: '高' },
			{ key: 'medium', label: '中' },
			{ key: 'normal', label: '普通' },
			{ key: 'low', label: '低' },
			{ key: 'lowest', label: '最低' },
		];

		const dropdown = container.createDiv('sidebar-dropdown');
		dropdown.style.cssText = 'position:absolute;z-index:100;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:6px;padding:4px;box-shadow:0 2px 8px rgba(0,0,0,0.2);';

		const renderPriorityItems = () => {
			dropdown.empty();
			for (const p of priorities) {
				const item = dropdown.createDiv('sidebar-dropdown-item');
				item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px;cursor:pointer;border-radius:4px;';
				item.toggleClass('is-selected', this.priorityFilter === p.key);

				const icon = item.createSpan();
				if (p.key !== 'all') setIcon(icon, 'flame');
				icon.style.width = '16px';

				const label = item.createSpan({ text: p.label });
				label.style.cssText = 'font-size:13px;';

				item.addEventListener('click', (e) => {
					e.stopPropagation();
					this.priorityFilter = p.key;
					this.renderTaskList();
					renderPriorityItems();
				});
			}
		};

		renderPriorityItems();

		const closeHandler = (e: MouseEvent) => {
			if (!dropdown.contains(e.target as Node)) {
				dropdown.remove();
				document.removeEventListener('click', closeHandler);
			}
		};
		setTimeout(() => document.addEventListener('click', closeHandler), 0);
	}

	private toggleSortDropdown(container: HTMLElement, anchor: HTMLElement): void {
		const existing = container.querySelector('.sidebar-dropdown');
		if (existing) { existing.remove(); return; }

		const sortOptions = [
			{ key: 'priority' as const, label: '按优先级' },
			{ key: 'dueDate' as const, label: '按截止日期' },
			{ key: 'startDate' as const, label: '按开始日期' },
		];

		const dropdown = container.createDiv('sidebar-dropdown');
		dropdown.style.cssText = 'position:absolute;z-index:100;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:6px;padding:4px;box-shadow:0 2px 8px rgba(0,0,0,0.2);';

		const renderSortItems = () => {
			dropdown.empty();
			for (const opt of sortOptions) {
				const isActive = this.sortBy === opt.key;
				const item = dropdown.createDiv('sidebar-dropdown-item');
				item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px;cursor:pointer;border-radius:4px;';
				item.toggleClass('is-selected', isActive);

				const icon = item.createSpan();
				setIcon(icon, isActive
					? (this.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down')
					: 'arrow-up-down');
				icon.style.width = '16px';

				const label = item.createSpan({ text: opt.label });
				label.style.cssText = 'font-size:13px;';

				if (isActive) {
					const dirLabel = item.createSpan({ text: this.sortOrder === 'asc' ? '升序' : '降序' });
					dirLabel.style.cssText = 'font-size:11px;color:var(--text-muted);margin-left:auto;';
				}

				item.addEventListener('click', (e) => {
					e.stopPropagation();
					if (this.sortBy === opt.key) {
						this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
					} else {
						this.sortBy = opt.key;
						this.sortOrder = 'asc';
					}
					this.renderTaskList();
					renderSortItems();
				});
			}
		};

		renderSortItems();

		const closeHandler = (e: MouseEvent) => {
			if (!dropdown.contains(e.target as Node)) {
				dropdown.remove();
				document.removeEventListener('click', closeHandler);
			}
		};
		setTimeout(() => document.addEventListener('click', closeHandler), 0);
	}

	private toggleTagDropdown(container: HTMLElement, anchor: HTMLElement): void {
		const existing = container.querySelector('.sidebar-dropdown');
		if (existing) { existing.remove(); return; }

		const allTasks = this.plugin?.taskCache?.getAllTasks() as GCTask[] | undefined;
		if (!allTasks) return;

		// 收集所有唯一标签
		const tagSet = new Set<string>();
		for (const task of allTasks) {
			if (task.tags) {
				for (const tag of task.tags) {
					tagSet.add(tag);
				}
			}
		}
		const allTags = Array.from(tagSet).sort();
		if (allTags.length === 0) return;

		const dropdown = container.createDiv('sidebar-dropdown');
		dropdown.style.cssText = 'position:absolute;z-index:100;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:6px;padding:4px;box-shadow:0 2px 8px rgba(0,0,0,0.2);min-width:160px;';

		const renderTagItems = () => {
			dropdown.empty();

			// OR/AND 切换
			const operatorRow = dropdown.createDiv('sidebar-dropdown-item');
			operatorRow.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px 8px;border-bottom:1px solid var(--background-modifier-border);margin-bottom:4px;';
			operatorRow.createSpan({ text: '匹配模式: ' }).style.cssText = 'font-size:12px;color:var(--text-muted);';
			const orBtn = operatorRow.createEl('button', { text: 'OR', cls: 'clickable-icon' });
			orBtn.style.cssText = 'font-size:11px;padding:2px 6px;border-radius:4px;';
			orBtn.toggleClass('is-selected', this.tagOperator === 'OR');
			const andBtn = operatorRow.createEl('button', { text: 'AND', cls: 'clickable-icon' });
			andBtn.style.cssText = 'font-size:11px;padding:2px 6px;border-radius:4px;';
			andBtn.toggleClass('is-selected', this.tagOperator === 'AND');
			orBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.tagOperator = 'OR';
				this.renderTaskList();
				renderTagItems();
			});
			andBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.tagOperator = 'AND';
				this.renderTaskList();
				renderTagItems();
			});

			// 标签列表
			for (const tag of allTags) {
				const isSelected = this.selectedTags.includes(tag);
				const item = dropdown.createDiv('sidebar-dropdown-item');
				item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px;cursor:pointer;border-radius:4px;';
				item.toggleClass('is-selected', isSelected);

				const checkbox = item.createEl('input', { type: 'checkbox' });
				checkbox.checked = isSelected;
				checkbox.style.margin = '0';

				const label = item.createSpan({ text: tag });
				label.style.cssText = 'font-size:13px;';

				item.addEventListener('click', (e) => {
					e.stopPropagation();
					if (isSelected) {
						this.selectedTags = this.selectedTags.filter(t => t !== tag);
					} else {
						this.selectedTags.push(tag);
					}
					this.renderTaskList();
					renderTagItems();
				});
			}
		};

		renderTagItems();

		const closeHandler = (e: MouseEvent) => {
			if (!dropdown.contains(e.target as Node)) {
				dropdown.remove();
				document.removeEventListener('click', closeHandler);
			}
		};
		setTimeout(() => document.addEventListener('click', closeHandler), 0);
	}

	private toggleDateFilterDropdown(container: HTMLElement, anchor: HTMLElement): void {
		const existing = container.querySelector('.sidebar-dropdown');
		if (existing) { existing.remove(); return; }

		const options = [
			{ key: 'all' as const, label: '全部', icon: 'infinity' },
			{ key: 'today' as const, label: '今天', icon: 'sun' },
			{ key: 'week' as const, label: '本周', icon: 'calendar-range' },
			{ key: 'month' as const, label: '本月', icon: 'calendar-days' },
		];

		const dropdown = container.createDiv('sidebar-dropdown');
		dropdown.style.cssText = 'position:absolute;z-index:100;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:6px;padding:4px;box-shadow:0 2px 8px rgba(0,0,0,0.2);';

		const renderDateItems = () => {
			dropdown.empty();
			for (const opt of options) {
				const item = dropdown.createDiv('sidebar-dropdown-item');
				item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px;cursor:pointer;border-radius:4px;';
				item.toggleClass('is-selected', this.dateFilter === opt.key);

				const icon = item.createSpan();
				setIcon(icon, opt.icon);
				icon.style.width = '16px';

				const label = item.createSpan({ text: opt.label });
				label.style.cssText = 'font-size:13px;';

				item.addEventListener('click', (e) => {
					e.stopPropagation();
					this.dateFilter = opt.key;
					this.renderTaskList();
					renderDateItems();
				});
			}
		};

		renderDateItems();

		const closeHandler = (e: MouseEvent) => {
			if (!dropdown.contains(e.target as Node)) {
				dropdown.remove();
				document.removeEventListener('click', closeHandler);
			}
		};
		setTimeout(() => document.addEventListener('click', closeHandler), 0);
	}

	private renderTaskList(): void {
		if (!this.taskListEl) return;

		// 保存滚动位置 — scrollContainer (contentContainer) 才是 overflow-y:auto 的真正滚动容器
		const savedScrollTop = this.scrollContainer?.scrollTop ?? 0;

		const allTasks = this.plugin?.taskCache?.getAllTasks() as GCTask[] | undefined;
		if (!allTasks) return;

		// 筛选
		let tasks = this.filterTasks(allTasks);

		// 搜索
		if (this.searchQuery) {
			tasks = tasks.filter(t =>
				(t.description || '').toLowerCase().includes(this.searchQuery) ||
				(t.filePath || '').toLowerCase().includes(this.searchQuery)
			);
		}

		// 排序
		const sortField = this.sortBy === 'priority' ? 'priority'
			: this.sortBy === 'dueDate' ? 'dueDate'
			: 'startDate';
		tasks = sortTasks(tasks, { field: sortField, order: this.sortOrder });

		// 计算新任务 ID 集合
		const newTaskIds = new Set(tasks.map(t => `${t.filePath}:${t.lineNumber}`));

		// 移除不再需要显示的卡片
		for (const [taskId, cardResult] of this.cardMap) {
			if (!newTaskIds.has(taskId)) {
				cardResult.destroy();
				this.cardMap.delete(taskId);
			}
		}

		// 移除旧的空状态提示
		const existingEmpty = this.taskListEl.querySelector(`.${SidebarClasses.elements.emptyState}`);
		if (existingEmpty) existingEmpty.remove();

		if (tasks.length === 0) {
			const empty = this.taskListEl.createDiv(SidebarClasses.elements.emptyState);
			empty.textContent = this.searchQuery ? '没有匹配的任务' : '暂无任务';
			return;
		}

		// 为新出现的任务创建卡片
		const config = buildSidebarConfig(this.plugin.settings);
		for (const task of tasks) {
			const taskId = `${task.filePath}:${task.lineNumber}`;
			if (!this.cardMap.has(taskId)) {
				const card = new TaskCardComponent({
					task,
					config,
					container: this.taskListEl!,
					app: this.app,
					plugin: this.plugin,
					onClick: () => {
						openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
					},
					onRefresh: () => this.renderTaskList(),
				});
				const result = card.render();
				this.cardMap.set(taskId, result);
			}
		}

		// 仅在 DOM 顺序与目标顺序不一致时才重排
		if (this.needsReorder(tasks)) {
			for (const task of tasks) {
				const taskId = `${task.filePath}:${task.lineNumber}`;
				const cardResult = this.cardMap.get(taskId);
				if (cardResult) {
					this.taskListEl.appendChild(cardResult.element);
				}
			}
		}

		// 恢复滚动位置
		if (this.scrollContainer) {
			this.scrollContainer.scrollTop = savedScrollTop;
		}
	}

	private needsReorder(tasks: GCTask[]): boolean {
		const children = this.taskListEl!.children;
		if (children.length !== this.cardMap.size) return true;

		const elementToId = new Map<HTMLElement, string>();
		for (const [id, card] of this.cardMap) {
			elementToId.set(card.element, id);
		}

		let taskIdx = 0;
		for (let i = 0; i < children.length; i++) {
			const id = elementToId.get(children[i] as HTMLElement);
			if (id) {
				if (id !== `${tasks[taskIdx].filePath}:${tasks[taskIdx].lineNumber}`) return true;
				taskIdx++;
			}
		}
		return taskIdx !== tasks.length;
	}

	private filterTasks(tasks: GCTask[]): GCTask[] {
		let result = tasks;

		// 状态筛选
		if (this.statusFilter.selectedStatuses.length > 0) {
			result = result.filter(t => {
				const status = this.inferStatus(t);
				return this.statusFilter.selectedStatuses.includes(status);
			});
		}

		// 优先级筛选
		if (this.priorityFilter !== 'all') {
			result = result.filter(t => t.priority === this.priorityFilter);
		}

		// 标签筛选
		if (this.selectedTags.length > 0) {
			result = result.filter(t => {
				if (!t.tags || t.tags.length === 0) return false;
				if (this.tagOperator === 'OR') {
					return this.selectedTags.some(tag => t.tags!.includes(tag));
				} else {
					return this.selectedTags.every(tag => t.tags!.includes(tag));
				}
			});
		}

		// 日期筛选
		if (this.dateFilter !== 'all') {
			const matchFn = this.dateFilter === 'today' ? isToday
				: this.dateFilter === 'week' ? (d: Date) => isThisWeek(d)
				: isThisMonth;
			result = result.filter(t => {
				const dates = [t.dueDate, t.scheduledDate, t.startDate, t.createdDate, t.completionDate];
				return dates.some(d => d && matchFn(d));
			});
		}

		// 排除已完成和已取消的任务（但如果其完成/取消日期匹配当前日期筛选则保留）
		// 当状态筛选明确选中了 done/canceled 时，不排除已完成/已取消的任务
		const showCompleted = this.statusFilter.selectedStatuses.includes('done');
		const showCanceled = this.statusFilter.selectedStatuses.includes('canceled');
		if (!showCompleted && !showCanceled) {
			const dateMatchFn = this.dateFilter !== 'all'
				? (this.dateFilter === 'today' ? isToday
					: this.dateFilter === 'week' ? (d: Date) => isThisWeek(d)
					: isThisMonth)
				: null;
			result = result.filter(t => {
				if (!t.completed && !t.cancelled) return true;
				if (!dateMatchFn) return false;
				if (t.completed && t.completionDate && dateMatchFn(t.completionDate)) return true;
				if (t.cancelled && t.cancelledDate && dateMatchFn(t.cancelledDate)) return true;
				return false;
			});
		}

		return result;
	}

	private inferStatus(task: GCTask): string {
		if (task.status) return task.status;
		if (task.completed) return 'done';
		if (task.cancelled) return 'canceled';
		return 'todo';
	}

	private destroyCards(): void {
		for (const [, cardResult] of this.cardMap) {
			cardResult.destroy();
		}
		this.cardMap.clear();
	}
}

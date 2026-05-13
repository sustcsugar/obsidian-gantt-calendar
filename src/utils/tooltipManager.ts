import type { IPluginContext, GCTask } from '../types';
import { formatDate } from '../dateUtils/dateUtilsIndex';
import { TagPill } from '../components/tagPill';
import { TooltipClasses } from './bem';

interface TooltipConfig {
	showDelay?: number;
	hideDelay?: number;
}

export interface MousePosition {
	x: number;
	y: number;
}

/**
 * Tooltip 单例管理器
 *
 * 分组展示：时间 → 优先级 → 标签 → 元数据 → 文件位置，
 * 每组用带底色的 section 容器包裹，视觉统一。
 */
export class TooltipManager {
	private static instance: TooltipManager | null = null;
	private tooltip: HTMLElement | null = null;
	private currentCard: HTMLElement | null = null;
	private currentTask: GCTask | null = null;
	private mousePosition: MousePosition | null = null;

	private showTimeout: number | null = null;
	private hideTimeout: number | null = null;

	private readonly config: Required<TooltipConfig>;

	private cachedElements: {
		description?: HTMLElement;
		properties?: HTMLElement;
	} = {};

	private constructor(private plugin: IPluginContext, config: TooltipConfig = {}) {
		this.config = {
			showDelay: config.showDelay ?? 400,
			hideDelay: config.hideDelay ?? 100
		};
	}

	static getInstance(plugin: IPluginContext, config?: TooltipConfig): TooltipManager {
		if (!TooltipManager.instance) {
			TooltipManager.instance = new TooltipManager(plugin, config);
		}
		return TooltipManager.instance;
	}

	private ensureTooltip(): HTMLElement {
		if (!this.tooltip || !document.body.contains(this.tooltip)) {
			this.tooltip = document.body.createDiv('gc-task-tooltip');
			this.tooltip.style.opacity = '0';

			this.cachedElements.description = this.tooltip.createDiv(TooltipClasses.elements.description);
			this.cachedElements.properties = this.tooltip.createDiv(TooltipClasses.elements.properties);

			this.cachedElements.properties.style.display = 'none';

			this.tooltip.addClass('gc-task-tooltip--initialized');
		}
		return this.tooltip;
	}

	show(task: GCTask, card: HTMLElement, mousePosition?: MousePosition): void {
		if (this.hideTimeout) {
			window.clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}

		this.mousePosition = mousePosition || null;

		if (this.currentTask === task && this.currentCard === card) {
			const isVisible = this.tooltip &&
							 this.tooltip.classList.contains('gc-task-tooltip--visible') &&
							 this.tooltip.style.opacity !== '0';

			if (isVisible) {
				this.updatePosition(card);
				return;
			}
		}

		const isDifferentTask = this.currentTask !== task || this.currentCard !== card;
		const isVisible = this.tooltip &&
						 this.tooltip.classList.contains('gc-task-tooltip--visible') &&
						 this.tooltip.style.opacity !== '0';

		if (isDifferentTask && isVisible) {
			if (this.tooltip) {
				this.tooltip.removeClass('gc-task-tooltip--visible');
				this.tooltip.style.opacity = '0';
			}
		}

		this.currentTask = task;
		this.currentCard = card;

		if (this.config.showDelay > 0) {
			if (this.showTimeout) {
				window.clearTimeout(this.showTimeout);
			}
			this.showTimeout = window.setTimeout(() => {
				this.showInternal(task, card);
			}, this.config.showDelay);
		} else {
			this.showInternal(task, card);
		}
	}

	private showInternal(task: GCTask, card: HTMLElement): void {
		const tooltip = this.ensureTooltip();
		this.updateContent(task);
		this.updatePosition(card);
		tooltip.style.opacity = '1';
		tooltip.addClass('gc-task-tooltip--visible');
	}

	/**
	 * 分组收集属性并渲染。
	 * 顺序：时间 → 优先级 → 标签 → 元数据 → 文件位置，
	 * 每组用 section 容器包裹（带底色和缩进）。
	 */
	private updateContent(task: GCTask): void {
		if (!this.cachedElements.description) return;

		// === 描述 ===
		const displayText = task.description || '';
		this.cachedElements.description.empty();
		const strongEl = this.cachedElements.description.createEl('strong');
		strongEl.setText(displayText);

		// === 分组收集属性 ===
		type PropRow = { label: string; value: string; valueClass?: string; isOverdue?: boolean };
		type Section = { key: string; rows: PropRow[] };
		const sections: Section[] = [];

		// --- 1. 时间组 ---
		const timeRows: PropRow[] = [];
		if (task.createdDate) {
			timeRows.push({ label: '创建', value: formatDate(task.createdDate, task.datePrecision?.createdDate === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd') });
		}
		if (task.startDate) {
			timeRows.push({ label: '开始', value: formatDate(task.startDate, task.datePrecision?.startDate === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd') });
		}
		if (task.scheduledDate) {
			timeRows.push({ label: '计划', value: formatDate(task.scheduledDate, task.datePrecision?.scheduledDate === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd') });
		}
		if (task.dueDate) {
			const isOverdue = task.dueDate < new Date() && !task.completed;
			timeRows.push({ label: '截止', value: formatDate(task.dueDate, task.datePrecision?.dueDate === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'), isOverdue });
		}
		if (task.cancelledDate) {
			timeRows.push({ label: '取消', value: formatDate(task.cancelledDate, task.datePrecision?.cancelledDate === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd') });
		}
		if (task.completionDate) {
			timeRows.push({ label: '完成', value: formatDate(task.completionDate, task.datePrecision?.completionDate === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd') });
		}
		if (task.repeat) {
			timeRows.push({ label: '重复', value: task.repeat });
		}
		if (timeRows.length > 0) {
			sections.push({ key: 'time', rows: timeRows });
		}

		// --- 2. 优先级组 ---
		if (task.priority && task.priority !== 'normal') {
			const priorityIcon = this.getPriorityIcon(task.priority);
			sections.push({
				key: 'priority',
				rows: [{ label: '优先级', value: `${priorityIcon} ${task.priority}`, valueClass: `priority-${task.priority}` }]
			});
		}

		// --- 3. 标签组 ---
		if (task.tags && task.tags.length > 0) {
			sections.push({ key: 'tags', rows: [] });
		}

		// --- 4. 元数据字段组 (%%[key::value]%%) ---
		if (task.metadataFields && task.metadataFields.length > 0) {
			sections.push({
				key: 'metadata',
				rows: task.metadataFields.map(f => ({ label: f.key, value: f.value || '(空)' }))
			});
		}

		// --- 5. 文件位置组 ---
		sections.push({
			key: 'file',
			rows: [{ label: '位置', value: `${task.fileName}:${task.lineNumber}` }]
		});

		// === 分组渲染 ===
		if (this.cachedElements.properties) {
			this.cachedElements.properties.empty();

			if (sections.length > 0) {
				let isFirst = true;

				for (const section of sections) {
					if (!isFirst) {
						this.cachedElements.properties.createDiv(TooltipClasses.elements.propertyDivider);
					}
					isFirst = false;

					const sectionEl = this.cachedElements.properties.createDiv(TooltipClasses.elements.propertySection);

					if (section.key === 'tags') {
						const tagsRow = sectionEl.createDiv(TooltipClasses.elements.tags);
						TagPill.createMultiple(task.tags!, tagsRow, { showHash: true });
					} else if (section.key === 'file') {
						const rowEl = sectionEl.createDiv(TooltipClasses.elements.propertyRow);
						const labelEl = rowEl.createDiv(TooltipClasses.elements.propertyLabel);
						labelEl.setText(section.rows[0].label);
						const valueEl = rowEl.createDiv(TooltipClasses.elements.propertyValue);
						valueEl.addClass(TooltipClasses.elements.fileLocation);
						valueEl.setText(section.rows[0].value);
					} else {
						for (const row of section.rows) {
							const rowEl = sectionEl.createDiv(TooltipClasses.elements.propertyRow);
							const labelEl = rowEl.createDiv(TooltipClasses.elements.propertyLabel);
							labelEl.setText(row.label);
							const valueEl = rowEl.createDiv(TooltipClasses.elements.propertyValue);
							if (row.valueClass) {
								valueEl.addClass(row.valueClass);
							}
							if (row.isOverdue) {
								valueEl.addClass(TooltipClasses.modifiers.propertyValueOverdue);
							}
							valueEl.setText(row.value);
						}
					}
				}

				this.cachedElements.properties.style.display = '';
			} else {
				this.cachedElements.properties.style.display = 'none';
			}
		}
	}

	private updatePosition(card: HTMLElement): void {
		if (!this.tooltip) return;

		const tooltipWidth = 300;
		const tooltipHeight = this.estimateTooltipHeight();

		let left: number;
		let top: number;

		if (this.mousePosition) {
			left = this.mousePosition.x + 15;
			top = this.mousePosition.y + 15;
		} else {
			const rect = card.getBoundingClientRect();
			left = rect.right + 10;
			top = rect.top;
		}

		if (left + tooltipWidth > window.innerWidth) {
			if (this.mousePosition) {
				left = this.mousePosition.x - tooltipWidth - 15;
			} else {
				const rect = card.getBoundingClientRect();
				left = rect.left - tooltipWidth - 10;
			}
		}
		if (left < 10) {
			left = 10;
		}
		if (top + tooltipHeight > window.innerHeight) {
			if (this.mousePosition) {
				top = this.mousePosition.y - tooltipHeight - 15;
			} else {
				top = window.innerHeight - tooltipHeight - 10;
			}
		}
		if (top < 10) {
			top = 10;
		}

		this.tooltip.style.left = `${left}px`;
		this.tooltip.style.top = `${top}px`;
	}

	private estimateTooltipHeight(): number {
		if (!this.currentTask) return 80;

		let height = 40; // description + base

		let sectionCount = 0;
		let rowCount = 0;

		if (this.currentTask.createdDate) rowCount++;
		if (this.currentTask.startDate) rowCount++;
		if (this.currentTask.scheduledDate) rowCount++;
		if (this.currentTask.dueDate) rowCount++;
		if (this.currentTask.cancelledDate) rowCount++;
		if (this.currentTask.completionDate) rowCount++;
		if (this.currentTask.repeat) rowCount++;
		if (rowCount > 0) sectionCount++;

		if (this.currentTask.priority && this.currentTask.priority !== 'normal') {
			rowCount++;
			sectionCount++;
		}

		if (this.currentTask.tags && this.currentTask.tags.length > 0) sectionCount++;

		if (this.currentTask.metadataFields) {
			rowCount += this.currentTask.metadataFields.length;
			if (this.currentTask.metadataFields.length > 0) sectionCount++;
		}

		// file section
		sectionCount++;
		rowCount++;

		height += rowCount * 24;
		height += sectionCount * 12;

		return Math.min(height, 400);
	}

	cancel(): void {
		if (this.showTimeout) {
			window.clearTimeout(this.showTimeout);
			this.showTimeout = null;
		}
		if (this.hideTimeout) {
			window.clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}
		if (this.tooltip) {
			this.tooltip.removeClass('gc-task-tooltip--visible');
			this.tooltip.style.opacity = '0';
		}
	}

	hide(): void {
		if (this.showTimeout) {
			window.clearTimeout(this.showTimeout);
			this.showTimeout = null;
		}
		this.hideTimeout = window.setTimeout(() => {
			if (this.tooltip) {
				this.tooltip.removeClass('gc-task-tooltip--visible');
				this.tooltip.style.opacity = '0';
			}
		}, this.config.hideDelay);
	}

	destroy(): void {
		if (this.showTimeout) {
			window.clearTimeout(this.showTimeout);
			this.showTimeout = null;
		}
		if (this.hideTimeout) {
			window.clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}
		if (this.tooltip) {
			this.tooltip.remove();
			this.tooltip = null;
		}
		this.cachedElements = {};
		this.currentTask = null;
		this.currentCard = null;
	}

	private getPriorityIcon(priority?: string): string {
		switch (priority) {
			case 'highest': return '🔺';
			case 'high': return '⏫';
			case 'medium': return '🔼';
			case 'low': return '🔽';
			case 'lowest': return '⏬';
			default: return '';
		}
	}

	static reset(): void {
		if (TooltipManager.instance) {
			TooltipManager.instance.destroy();
			TooltipManager.instance = null;
		}
	}
}

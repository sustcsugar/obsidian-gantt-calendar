import type { IPluginContext, GCTask } from '../types';
import { TooltipClasses, setCssProps } from './bem';
import { TagPill } from '../components/tagPill';
import { i18n } from '../i18n/i18n';
import {
	buildTooltipSections,
	type TooltipPropRow,
} from '../components/tooltip/tooltipSections';
import { computeTooltipPosition } from '../components/tooltip/tooltipPosition';
import {
	registerTooltipHolder,
	claimExclusiveTooltip,
} from '../components/tooltip/tooltipCoordinator';

interface TooltipConfig {
	showDelay?: number;
	hideDelay?: number;
}

export interface MousePosition {
	x: number;
	y: number;
}

export interface RollupTooltipInfo {
	/** 节点层级文案（项目文件夹 / 型号文档 / 父阶段） */
	levelLabel: string;
	/** 节点名称 */
	name: string;
	/** 聚合起止日期（YYYY-MM-DD） */
	startStr: string;
	endStr: string;
	/** 总跨度天数（含首尾） */
	spanDays: number;
	/** 包含的有效叶子任务数 */
	leafTaskCount: number;
	/** 已完成有效叶子任务数（T9 汇总进度） */
	completedTaskCount?: number;
	/** 完成率 0 ~ 1（T9 汇总进度） */
	progressRatio?: number;
	/** 可选文件路径 */
	filePath?: string;
}

/**
 * Tooltip 单例管理器（甘特图 SVG 渲染器专用）
 *
 * 内容构建与定位算法同 React TooltipProvider 共享（components/tooltip），
 * 分组展示：时间 → 优先级 → 标签 → 元数据 → 文件位置。
 */
export class TooltipManager {
	private static instance: TooltipManager | null = null;
	private tooltip: HTMLElement | null = null;
	private currentCard: HTMLElement | null = null;
	private currentTask: GCTask | null = null;
	private currentRollupKey: string | null = null;
	private mousePosition: MousePosition | null = null;

	private showTimeout: number | null = null;
	private hideTimeout: number | null = null;

	private readonly config: Required<TooltipConfig>;

	private cachedElements: {
		description?: HTMLElement;
		properties?: HTMLElement;
	} = {};

	/** 跨实例互斥协调器注销句柄（绑定本实例的 cancel） */
	private readonly coordinatorCancel = () => this.cancel();
	private unregisterCoordinator: (() => void) | null = null;

	private constructor(private plugin: IPluginContext, config: TooltipConfig = {}) {
		this.config = {
			showDelay: config.showDelay ?? 400,
			hideDelay: config.hideDelay ?? 100
		};
		this.unregisterCoordinator = registerTooltipHolder(this.coordinatorCancel);
	}

	static getInstance(plugin: IPluginContext, config?: TooltipConfig): TooltipManager {
		if (!TooltipManager.instance) {
			TooltipManager.instance = new TooltipManager(plugin, config);
		}
		return TooltipManager.instance;
	}

	private ensureTooltip(): HTMLElement {
		if (!this.tooltip || !activeDocument.body.contains(this.tooltip)) {
			this.tooltip = activeDocument.body.createDiv(TooltipClasses.block);
			setCssProps(this.tooltip, { opacity: '0' });

			this.cachedElements.description = this.tooltip.createDiv(TooltipClasses.elements.description);
			this.cachedElements.properties = this.tooltip.createDiv(TooltipClasses.elements.properties);

			this.cachedElements.properties.addClass('gc-u-hidden');
		}
		return this.tooltip;
	}

	show(task: GCTask, card: HTMLElement, mousePosition?: MousePosition, extraWarning?: string): void {
		if (this.hideTimeout) {
			window.clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}

		this.mousePosition = mousePosition || null;
		this.currentRollupKey = null;

		if (this.currentTask === task && this.currentCard === card) {
			const isVisible = this.tooltip &&
							 this.tooltip.classList.contains(TooltipClasses.modifiers.visible) &&
							 this.tooltip.style.opacity !== '0';

			if (isVisible) {
				this.updatePosition(card);
				return;
			}
		}

		const isDifferentTask = this.currentTask !== task || this.currentCard !== card;
		const isVisible = this.tooltip &&
						 this.tooltip.classList.contains(TooltipClasses.modifiers.visible) &&
						 this.tooltip.style.opacity !== '0';

		if (isDifferentTask && isVisible) {
			if (this.tooltip) {
				this.tooltip.removeClass(TooltipClasses.modifiers.visible);
				setCssProps(this.tooltip, { opacity: '0' });
			}
		}

		this.currentTask = task;
		this.currentCard = card;

		if (this.config.showDelay > 0) {
			if (this.showTimeout) {
				window.clearTimeout(this.showTimeout);
			}
			this.showTimeout = window.setTimeout(() => {
				this.showInternal(task, card, extraWarning);
			}, this.config.showDelay);
		} else {
			this.showInternal(task, card, extraWarning);
		}
	}

	/**
	 * 展示树形汇总条专属 Tooltip（层级名称、起止跨度与天数、包含有效任务数）
	 */
	showRollup(info: RollupTooltipInfo, card: HTMLElement, mousePosition?: MousePosition): void {
		if (this.hideTimeout) {
			window.clearTimeout(this.hideTimeout);
			this.hideTimeout = null;
		}

		this.mousePosition = mousePosition || null;
		const rollupKey = `${info.levelLabel}|${info.name}|${info.startStr}|${info.endStr}|${info.completedTaskCount ?? ''}/${info.leafTaskCount}`;

		if (this.currentRollupKey === rollupKey && this.currentCard === card) {
			const isVisible = this.tooltip &&
				this.tooltip.classList.contains(TooltipClasses.modifiers.visible) &&
				this.tooltip.style.opacity !== '0';
			if (isVisible) {
				this.updatePosition(card);
				return;
			}
		}

		const isVisible = this.tooltip &&
			this.tooltip.classList.contains(TooltipClasses.modifiers.visible) &&
			this.tooltip.style.opacity !== '0';
		if (isVisible && this.tooltip) {
			this.tooltip.removeClass(TooltipClasses.modifiers.visible);
			setCssProps(this.tooltip, { opacity: '0' });
		}

		this.currentTask = null;
		this.currentRollupKey = rollupKey;
		this.currentCard = card;

		const renderNow = () => {
			const tooltip = this.ensureTooltip();
			claimExclusiveTooltip(this.coordinatorCancel);
			this.updateRollupContent(info);
			this.updatePosition(card);
			setCssProps(tooltip, { opacity: '1' });
			tooltip.addClass(TooltipClasses.modifiers.visible);
		};

		if (this.config.showDelay > 0) {
			if (this.showTimeout) {
				window.clearTimeout(this.showTimeout);
			}
			this.showTimeout = window.setTimeout(renderNow, this.config.showDelay);
		} else {
			renderNow();
		}
	}

	private showInternal(task: GCTask, card: HTMLElement, extraWarning?: string): void {
		const tooltip = this.ensureTooltip();
		claimExclusiveTooltip(this.coordinatorCancel);
		this.updateContent(task, extraWarning);
		this.updatePosition(card);
		setCssProps(tooltip, { opacity: '1' });
		tooltip.addClass(TooltipClasses.modifiers.visible);
	}

	private updateRollupContent(info: RollupTooltipInfo): void {
		if (!this.cachedElements.description || !this.cachedElements.properties) return;

		this.cachedElements.description.empty();
		const strongEl = this.cachedElements.description.createEl('strong');
		strongEl.setText(`${info.levelLabel} · ${info.name}`);

		this.cachedElements.properties.empty();
		const sectionEl = this.cachedElements.properties.createDiv(TooltipClasses.elements.propertySection);

		const daysText = i18n.t('views.ganttView.rollupTooltip.days', { count: info.spanDays });
		this.appendPropertyRow(sectionEl, {
			label: i18n.t('views.ganttView.rollupTooltip.dateRange'),
			value: `${info.startStr} ~ ${info.endStr} (${daysText})`,
		});
		this.appendPropertyRow(sectionEl, {
			label: i18n.t('views.ganttView.rollupTooltip.taskCount'),
			value: String(info.leafTaskCount),
		});
		if (info.leafTaskCount > 0 && info.completedTaskCount !== undefined) {
			const pct = Math.round((info.progressRatio ?? (info.completedTaskCount / info.leafTaskCount)) * 100);
			this.appendPropertyRow(sectionEl, {
				label: i18n.t('views.ganttView.rollupTooltip.progress'),
				value: `${info.completedTaskCount} / ${info.leafTaskCount} (${pct}%)`,
			});
		}

		if (info.filePath) {
			this.cachedElements.properties.createDiv(TooltipClasses.elements.propertyDivider);
			const fileSection = this.cachedElements.properties.createDiv(TooltipClasses.elements.propertySection);
			this.appendPropertyRow(fileSection, {
				label: '📄',
				value: info.filePath,
			}, true);
		}

		this.cachedElements.properties.removeClass('gc-u-hidden');
	}

	/**
	 * 渲染共享构建的分组内容（与 React TooltipProvider 同源）
	 */
	private updateContent(task: GCTask, extraWarning?: string): void {
		if (!this.cachedElements.description) return;

		// === 描述 ===
		this.cachedElements.description.empty();
		const strongEl = this.cachedElements.description.createEl('strong');
		strongEl.setText(task.description || '');

		const sections = buildTooltipSections(task);

		if (this.cachedElements.properties) {
			this.cachedElements.properties.empty();

			if (sections.length > 0 || extraWarning) {
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
						this.appendPropertyRow(sectionEl, section.rows[0], true);
					} else {
						for (const row of section.rows) {
							this.appendPropertyRow(sectionEl, row);
						}
					}
				}

				if (extraWarning) {
					if (!isFirst) {
						this.cachedElements.properties.createDiv(TooltipClasses.elements.propertyDivider);
					}
					const warnSection = this.cachedElements.properties.createDiv(TooltipClasses.elements.propertySection);
					this.appendPropertyRow(warnSection, {
						label: '⚠',
						value: extraWarning,
						isOverdue: true,
					});
				}

				this.cachedElements.properties.removeClass('gc-u-hidden');
			} else {
				this.cachedElements.properties.addClass('gc-u-hidden');
			}
		}
	}

	private appendPropertyRow(container: HTMLElement, row: TooltipPropRow, isFileLocation = false): void {
		const rowEl = container.createDiv(TooltipClasses.elements.propertyRow);
		const labelEl = rowEl.createDiv(TooltipClasses.elements.propertyLabel);
		labelEl.setText(row.label);
		const valueEl = rowEl.createDiv(TooltipClasses.elements.propertyValue);
		if (isFileLocation) {
			valueEl.addClass(TooltipClasses.elements.fileLocation);
		}
		if (row.valueClass) {
			valueEl.addClass(row.valueClass);
		}
		if (row.isOverdue) {
			valueEl.addClass(TooltipClasses.modifiers.propertyValueOverdue);
		}
		valueEl.setText(row.value);
	}

	private updatePosition(card: HTMLElement): void {
		if (!this.tooltip) return;

		const { left, top } = computeTooltipPosition({
			anchorRect: card.getBoundingClientRect(),
			mouse: this.mousePosition,
			width: this.tooltip.offsetWidth || 300,
			height: this.tooltip.offsetHeight || 160,
		});
		setCssProps(this.tooltip, { left: `${left}px`, top: `${top}px` });
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
			this.tooltip.removeClass(TooltipClasses.modifiers.visible);
			setCssProps(this.tooltip, { opacity: '0' });
		}
	}

	hide(): void {
		if (this.showTimeout) {
			window.clearTimeout(this.showTimeout);
			this.showTimeout = null;
		}
		this.hideTimeout = window.setTimeout(() => {
			if (this.tooltip) {
				this.tooltip.removeClass(TooltipClasses.modifiers.visible);
				setCssProps(this.tooltip, { opacity: '0' });
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
		this.unregisterCoordinator?.();
		this.unregisterCoordinator = null;
	}

	static reset(): void {
		if (TooltipManager.instance) {
			TooltipManager.instance.destroy();
			TooltipManager.instance = null;
		}
	}
}

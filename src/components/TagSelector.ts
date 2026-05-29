import { i18n } from '../i18n/i18n';
/**
 * 标签选择器组件
 *
 * 提供统一的标签选择界面，支持：
 * - 推荐标签（基于频率）
 * - 已选标签管理
 * - 新建标签
 *
 * 使用 TagPill 组件保持样式一致性
 */

import type { GCTask } from '../types';
import { TagPill } from './tagPill/TagPill';

/**
 * 标签选择器配置选项
 */
export interface TagSelectorOptions {
	/** 容器元素 */
	container: HTMLElement;
	/** 所有任务（用于计算推荐标签） */
	allTasks: GCTask[];
	/** 初始已选标签 */
	initialTags?: string[];
	/** 是否紧凑模式（更小的间距） */
	compact?: boolean;
	/** 标签变化回调 */
	onChange?: (tags: string[]) => void;
}

/**
 * 标签选择器类
 */
export class TagSelector {
	private container: HTMLElement;
	private allTasks: GCTask[];
	private selectedTags: Set<string>;
	private isCompact: boolean;
	private onChange?: (tags: string[]) => void;

	// UI 元素引用
	private recommendedGrid: HTMLElement;
	private selectedGrid: HTMLElement;
	private newTagInput: HTMLInputElement;

	constructor(options: TagSelectorOptions) {
		this.container = options.container;
		this.allTasks = options.allTasks;
		this.selectedTags = new Set(options.initialTags || []);
		this.isCompact = options.compact || false;
		this.onChange = options.onChange;

		this.render();
	}

	/**
	 * 渲染标签选择器
	 */
	private render(): void {
		this.container.empty();

		// 推荐标签区域
		this.renderRecommendedSection();

		// 已选标签区域
		this.renderSelectedSection();

		// 新建标签输入
		this.renderNewTagSection();
	}

	/**
	 * 渲染推荐标签区域
	 */
	private renderRecommendedSection(): void {
		const recommendedSection = this.container.createDiv('gc-tag-selector-recommended-section');
		recommendedSection.createEl('small', {
			text: i18n.t('modals.createTask.tags.recommendedLabel'),
			cls: 'gc-tag-selector-label'
		});

		this.recommendedGrid = recommendedSection.createDiv('gc-tag-selector-grid');

		this.updateRecommendedTags();
	}

	/**
	 * 更新推荐标签显示
	 */
	private updateRecommendedTags(): void {
		this.recommendedGrid.empty();

		const recommendedTags = this.getRecommendedTags();
		if (recommendedTags.length === 0) {
			this.recommendedGrid.createEl('small', {
				text: i18n.t('modals.createTask.tags.noRecommended')
			}).style.opacity = '0.5';
			return;
		}

		recommendedTags.forEach(tag => {
			const isSelected = this.selectedTags.has(tag);

			// 使用 TagPill 创建标签胶囊
			const tagEl = TagPill.create({
				label: tag,
				showHash: true,
				selectable: true,
				selected: isSelected,
				onClick: () => {
					this.toggleTag(tag);
					this.updateRecommendedTags();
					this.updateSelectedTags();
					this.notifyChange();
				}
			});

			this.recommendedGrid.appendChild(tagEl);
		});
	}

	/**
	 * 渲染已选标签区域
	 */
	private renderSelectedSection(): void {
		const selectedSection = this.container.createDiv('gc-tag-selector-selected-section');
		selectedSection.createEl('small', {
			text: i18n.t('modals.createTask.tags.selectedLabel'),
			cls: 'gc-tag-selector-label'
		});

		this.selectedGrid = selectedSection.createDiv('gc-tag-selector-grid');

		this.updateSelectedTags();
	}

	/**
	 * 更新已选标签显示
	 */
	private updateSelectedTags(): void {
		this.selectedGrid.empty();

		if (this.selectedTags.size === 0) {
			this.selectedGrid.createEl('small', {
				text: i18n.t('modals.createTask.tags.noSelected')
			}).style.opacity = '0.5';
			return;
		}

		this.selectedTags.forEach(tag => {
			// 使用 TagPill 创建标签胶囊，带删除后缀
			const tagEl = TagPill.create({
				label: tag,
				showHash: true,
				selectable: true,
				selected: true,
				suffix: '×',
				onClick: () => {
					this.toggleTag(tag);
					this.updateRecommendedTags();
					this.updateSelectedTags();
					this.notifyChange();
				}
			});

			this.selectedGrid.appendChild(tagEl);
		});
	}

	/**
	 * 渲染新建标签输入区域
	 */
	private renderNewTagSection(): void {
		const newSection = this.container.createDiv('gc-tag-selector-new-section');

		this.newTagInput = newSection.createEl('input', {
			type: 'text',
			cls: 'gc-tag-selector-new-input',
			attr: { placeholder: i18n.t('modals.createTask.tags.inputPlaceholder') }
		});

		const addButton = newSection.createEl('button', {
			text: i18n.t('common.add'),
			cls: 'gc-tag-selector-new-button'
		});

		const addNewTag = () => {
			const newTag = this.newTagInput.value.trim().replace(/^#/, '');
			if (!newTag) {
				return;
			}
			if (this.selectedTags.has(newTag)) {
				this.newTagInput.value = '';
				return;
			}
			this.selectedTags.add(newTag);
			this.newTagInput.value = '';
			this.updateRecommendedTags();
			this.updateSelectedTags();
			this.notifyChange();
		};

		addButton.addEventListener('click', addNewTag);

		this.newTagInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				addNewTag();
			}
		});
	}

	/**
	 * 切换标签选中状态
	 */
	private toggleTag(tag: string): void {
		if (this.selectedTags.has(tag)) {
			this.selectedTags.delete(tag);
		} else {
			this.selectedTags.add(tag);
		}
	}

	/**
	 * 通知标签变化
	 */
	private notifyChange(): void {
		if (this.onChange) {
			this.onChange(Array.from(this.selectedTags));
		}
	}

	/**
	 * 获取推荐标签（基于频率）
	 */
	private getRecommendedTags(): string[] {
		const frequency = new Map<string, number>();

		this.allTasks.forEach(task => {
			task.tags?.forEach(tag => {
				frequency.set(tag, (frequency.get(tag) || 0) + 1);
			});
		});

		return Array.from(frequency.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 12)
			.map(([tag]) => tag);
	}

	/**
	 * 获取当前选中的标签
	 */
	public getSelectedTags(): string[] {
		return Array.from(this.selectedTags);
	}

	/**
	 * 设置选中标签
	 */
	public setSelectedTags(tags: string[]): void {
		this.selectedTags = new Set(tags);
		this.updateRecommendedTags();
		this.updateSelectedTags();
	}

	/**
	 * 聚焦到新建标签输入框
	 */
	public focus(): void {
		this.newTagInput.focus();
	}

	/**
	 * 销毁组件
	 */
	public destroy(): void {
		this.container.empty();
	}
}

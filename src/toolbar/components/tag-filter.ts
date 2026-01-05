/**
 * @fileoverview 标签筛选按钮组件
 * @module toolbar/components/tag-filter
 */

import type { GanttTask } from '../../types';
import type { TagFilterState } from '../../types';
import { ToolbarComponentClasses } from '../../utils/bem';

/**
 * 标签筛选器配置选项
 */
export interface TagFilterOptions {
	/** 获取当前标签筛选状态 */
	getCurrentState: () => TagFilterState;
	/** 标签筛选状态变化回调 */
	onTagFilterChange: (newState: TagFilterState) => void;
	/** 获取所有任务（用于提取标签） */
	getAllTasks: () => GanttTask[];
}

/**
 * 提取所有任务中的唯一标签及其数量
 * @param tasks 任务列表
 * @returns 标签名称 -> 数量的映射
 */
function extractAllTags(tasks: GanttTask[]): Map<string, number> {
	const tagCounts = new Map<string, number>();

	for (const task of tasks) {
		if (!task.tags || task.tags.length === 0) continue;

		for (const tag of task.tags) {
			const normalized = tag.toLowerCase().trim();
			tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + 1);
		}
	}

	return tagCounts;
}

/**
 * 获取标签颜色索引（复用 BaseViewRenderer 逻辑）
 * @param tag 标签名称
 * @returns 颜色索引（0-5）
 */
function getTagColorIndex(tag: string): number {
	let hash = 0;
	for (let i = 0; i < tag.length; i++) {
		hash = ((hash << 5) - hash) + tag.charCodeAt(i);
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash) % 6;
}

/**
 * 渲染标签筛选按钮
 *
 * 特性：
 * - 点击按钮显示/隐藏标签选择窗格
 * - 窗格顶部显示 AND/OR 组合器切换按钮
 * - 标签以胶囊样式平铺展示（按数量降序）
 * - 点击标签切换选中状态，窗格保持打开
 * - 按钮显示当前选中的标签数量
 * - 点击窗格外区域关闭窗格
 *
 * @param container 容器元素
 * @param options 配置选项
 * @returns 清理函数对象
 */
export function renderTagFilterButton(
	container: HTMLElement,
	options: TagFilterOptions
): { cleanup: () => void } {
	const { getCurrentState, onTagFilterChange, getAllTasks } = options;
	const classes = ToolbarComponentClasses.tagFilter;

	// 创建按钮容器
	const buttonContainer = container.createDiv(classes.containerGantt);

	// 创建标签筛选按钮
	const tagBtn = buttonContainer.createEl('button', {
		cls: `calendar-view-compact-btn ${classes.btn}`,
		attr: { title: '标签筛选', 'aria-label': '标签筛选' }
	});

	// 按钮图标
	const iconSpan = tagBtn.createSpan(classes.icon);
	iconSpan.setText('🏷️');

	// 选中数量徽章
	const countBadge = tagBtn.createSpan(classes.count);
	countBadge.setText('0');
	countBadge.style.display = 'none';

	// 更新按钮状态
	const updateButtonState = () => {
		const state = getCurrentState();
		const count = state.selectedTags.length;

		if (count > 0) {
			countBadge.setText(String(count));
			countBadge.style.display = 'inline';
			tagBtn.addClass(classes.btnHasSelection);
		} else {
			countBadge.style.display = 'none';
			tagBtn.removeClass(classes.btnHasSelection);
		}
	};

	// 创建标签选择窗格
	const pane = document.createElement('div');
	pane.addClass(classes.pane);
	pane.style.display = 'none';
	document.body.appendChild(pane);

	// 存储组合器按钮元素引用，用于更新状态
	let andBtnElement: HTMLElement | null = null;
	let orBtnElement: HTMLElement | null = null;

	// 存储标签项元素的映射，用于更新选中状态而不重新渲染
	const tagItemElements = new Map<string, HTMLElement>();

	// 更新组合器按钮的激活状态（不重新渲染）
	const updateOperatorButtons = () => {
		const state = getCurrentState();
		if (state.operator === 'AND') {
			andBtnElement?.addClass(classes.operatorBtnActive);
			orBtnElement?.removeClass(classes.operatorBtnActive);
		} else {
			andBtnElement?.removeClass(classes.operatorBtnActive);
			orBtnElement?.addClass(classes.operatorBtnActive);
		}
	};

	// 渲染窗格内容
	const renderPane = () => {
		pane.empty();
		tagItemElements.clear();

		const state = getCurrentState();
		const allTasks = getAllTasks();
		const tagCounts = extractAllTags(allTasks);

		// 组合器区域
		const operators = pane.createDiv(classes.operators);

		andBtnElement = operators.createEl('button', {
			text: 'AND',
			cls: classes.operatorBtn,
			attr: {
				title: '交集模式：任务必须包含所有选中标签',
				'aria-label': 'AND 交集模式',
				'type': 'button'
			}
		});
		if (state.operator === 'AND') andBtnElement.addClass(classes.operatorBtnActive);

		orBtnElement = operators.createEl('button', {
			text: 'OR',
			cls: classes.operatorBtn,
			attr: {
				title: '并集模式：任务包含任一选中标签即可',
				'aria-label': 'OR 并集模式',
				'type': 'button'
			}
		});
		if (state.operator === 'OR') orBtnElement.addClass(classes.operatorBtnActive);

		// 组合器按钮点击事件 - 阻止冒泡，不重新渲染
		andBtnElement.addEventListener('click', (e) => {
			e.stopPropagation();
			const currentState = getCurrentState();
			if (currentState.operator !== 'AND') {
				onTagFilterChange({ ...currentState, operator: 'AND' });
				updateOperatorButtons();
			}
		});

		orBtnElement.addEventListener('click', (e) => {
			e.stopPropagation();
			const currentState = getCurrentState();
			if (currentState.operator !== 'OR') {
				onTagFilterChange({ ...currentState, operator: 'OR' });
				updateOperatorButtons();
			}
		});

		// 标签网格区域
		const grid = pane.createDiv(classes.tagsGrid);

		// 按数量降序排序
		const sortedTags = Array.from(tagCounts.entries())
			.sort((a, b) => b[1] - a[1]);

		// 空状态提示
		if (sortedTags.length === 0) {
			const emptyMsg = grid.createEl('div', {
				text: '暂无标签',
				cls: classes.empty
			});
			return;
		}

		// 渲染标签项（胶囊样式）
		for (const [tag, count] of sortedTags) {
			const isSelected = state.selectedTags.includes(tag);
			const colorIndex = getTagColorIndex(tag);

			const tagItem = grid.createEl('div', {
				cls: `${classes.tagItem} tag-color-${colorIndex}`,
				attr: {
					'data-tag': tag,
					role: 'button',
					'aria-pressed': String(isSelected)
				}
			});
			if (isSelected) tagItem.addClass(classes.tagItemSelected);

			// 存储引用以便后续更新
			tagItemElements.set(tag, tagItem);

			// 胶囊样式：标签名称和数量在同一行
			tagItem.innerHTML = `<span class="${classes.tagName}">#${tag}</span><span class="${classes.tagCount}">${count}</span>`;

			// 点击切换选中状态（不重新渲染窗格）
			tagItem.addEventListener('click', (e) => {
				e.stopPropagation();
				// 获取最新状态
				const currentState = getCurrentState();
				const newSelected = [...currentState.selectedTags];
				const idx = newSelected.indexOf(tag);

				if (idx >= 0) {
					newSelected.splice(idx, 1);
				} else {
					newSelected.push(tag);
				}

				onTagFilterChange({ ...currentState, selectedTags: newSelected });

				// 更新按钮状态
				updateButtonState();

				// 只更新当前标签项的选中状态，不重新渲染整个窗格
				const nowSelected = newSelected.includes(tag);
				if (nowSelected) {
					tagItem.addClass(classes.tagItemSelected);
					tagItem.setAttribute('aria-pressed', 'true');
				} else {
					tagItem.removeClass(classes.tagItemSelected);
					tagItem.setAttribute('aria-pressed', 'false');
				}
			});
		}
	};

	// 切换窗格显示/隐藏
	tagBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const isVisible = pane.style.display !== 'none';
		if (isVisible) {
			pane.style.display = 'none';
		} else {
			renderPane();
			const rect = tagBtn.getBoundingClientRect();
			pane.style.top = `${rect.bottom + 4}px`;
			pane.style.left = `${rect.left}px`;
			pane.style.display = 'block';
		}
	});

	// 点击外部关闭窗格
	const closeOnClickOutside = (e: MouseEvent) => {
		if (!pane.contains(e.target as Node) && !tagBtn.contains(e.target as Node)) {
			pane.style.display = 'none';
		}
	};

	document.addEventListener('click', closeOnClickOutside);

	// 清理函数
	const cleanup = () => {
		document.removeEventListener('click', closeOnClickOutside);
		pane.remove();
	};

	return { cleanup };
}

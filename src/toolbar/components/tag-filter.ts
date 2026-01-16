/**
 * @fileoverview 标签筛选按钮组件
 * @module toolbar/components/tag-filter
 */

import { setIcon } from 'obsidian';
import type { GCTask } from '../../types';
import type { TagFilterState } from '../../types';
import { ToolbarClasses } from '../../utils/bem';
import { TagPill } from '../../components/tagPill';

/**
 * 标签筛选器配置选项
 */
export interface TagFilterOptions {
	/** 获取当前标签筛选状态 */
	getCurrentState: () => TagFilterState;
	/** 标签筛选状态变化回调 */
	onTagFilterChange: (newState: TagFilterState) => void;
	/** 获取所有任务（用于提取标签） */
	getAllTasks: () => GCTask[];
}

/**
 * 提取所有任务中的唯一标签及其数量
 * @param tasks 任务列表
 * @returns 标签名称 -> 数量的映射（保留原始大小写）
 */
function extractAllTags(tasks: GCTask[]): Map<string, number> {
	const tagCounts = new Map<string, number>();
	const originalTagMap = new Map<string, string>(); // 小写 -> 原始标签名

	for (const task of tasks) {
		if (!task.tags || task.tags.length === 0) continue;

		for (const tag of task.tags) {
			const normalized = tag.toLowerCase().trim();
			// 只在第一次遇到时存储原始标签名
			if (!originalTagMap.has(normalized)) {
				originalTagMap.set(normalized, tag);
			}
			tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + 1);
		}
	}

	// 转换为原始标签名 -> 数量的映射
	const result = new Map<string, number>();
	originalTagMap.forEach((originalTag, normalized) => {
		result.set(originalTag, tagCounts.get(normalized)!);
	});

	return result;
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
	const classes = ToolbarClasses.components.tagFilter;

	// 创建下凹底座容器（与导航按钮组样式一致）
	const buttonGroup = container.createDiv(ToolbarClasses.components.navButtons.group);
	// 添加响应式优先级类（第二优先级隐藏）
	buttonGroup.addClass(ToolbarClasses.priority.priority2);

	// 创建标签筛选按钮
	const tagBtn = buttonGroup.createEl('button', {
		cls: ToolbarClasses.components.navButtons.btn,
		attr: { title: '标签筛选', 'aria-label': '标签筛选' }
	});

	// 按钮图标 - 使用线条风格的标签图标
	const iconSpan = tagBtn.createSpan(classes.icon);
	setIcon(iconSpan, 'tags');

	// 创建标签选择窗格
	const pane = document.createElement('div');
	pane.addClass(classes.pane);
	pane.style.display = 'none';
	document.body.appendChild(pane);

	// 存储组合器按钮元素引用，用于更新状态
	let andBtnElement: HTMLElement | null = null;
	let orBtnElement: HTMLElement | null = null;
	let notBtnElement: HTMLElement | null = null;

	// 存储标签项元素的映射，用于更新选中状态而不重新渲染
	const tagItemElements = new Map<string, HTMLElement>();

	// 更新组合器按钮的激活状态（不重新渲染）
	const updateOperatorButtons = () => {
		const state = getCurrentState();
		if (state.operator === 'AND') {
			andBtnElement?.addClass(classes.operatorBtnActive);
			orBtnElement?.removeClass(classes.operatorBtnActive);
			notBtnElement?.removeClass(classes.operatorBtnActive);
		} else if (state.operator === 'OR') {
			andBtnElement?.removeClass(classes.operatorBtnActive);
			orBtnElement?.addClass(classes.operatorBtnActive);
			notBtnElement?.removeClass(classes.operatorBtnActive);
		} else {
			andBtnElement?.removeClass(classes.operatorBtnActive);
			orBtnElement?.removeClass(classes.operatorBtnActive);
			notBtnElement?.addClass(classes.operatorBtnActive);
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

		notBtnElement = operators.createEl('button', {
			text: 'NOT',
			cls: classes.operatorBtn,
			attr: {
				title: '排除模式：排除包含任一选中标签的任务',
				'aria-label': 'NOT 排除模式',
				'type': 'button'
			}
		});
		if (state.operator === 'NOT') notBtnElement.addClass(classes.operatorBtnActive);

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

		notBtnElement.addEventListener('click', (e) => {
			e.stopPropagation();
			const currentState = getCurrentState();
			if (currentState.operator !== 'NOT') {
				onTagFilterChange({ ...currentState, operator: 'NOT' });
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

			// 使用 TagPill 组件创建标签
			const tagItem = TagPill.create({
				label: tag,
				showHash: true,
				selectable: true,
				selected: isSelected,
				suffix: String(count),
				onClick: (e, tag, selected) => {
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

					// 立即同步更新工具栏标签筛选器的选中样式类
					// 通过 currentTarget 获取绑定事件的元素（即 TagPill 创建的元素）
					const tagEl = e.currentTarget as HTMLElement;
					if (idx >= 0) {
						tagEl.removeClass(classes.tagItemSelected);
					} else {
						tagEl.addClass(classes.tagItemSelected);
					}

					onTagFilterChange({ ...currentState, selectedTags: newSelected });
				},
				ariaAttrs: {
					role: 'button',
					'aria-pressed': String(isSelected)
				}
			});

			// 添加额外的 grid 布局样式
			tagItem.addClasses([classes.tagItem]);
			if (isSelected) tagItem.addClass(classes.tagItemSelected);

			// 存储引用以便后续更新
			tagItemElements.set(tag, tagItem);

			grid.appendChild(tagItem);
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

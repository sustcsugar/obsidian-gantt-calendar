/**
 * @fileoverview 标签筛选按钮组件（支持多级标签树形结构）
 * @module toolbar/components/tag-filter
 */

import { setIcon } from 'obsidian';
import type { GCTask } from '../../types';
import type { TagFilterState } from '../../types';
import { ToolbarClasses } from '../../utils/bem';
import { i18n } from '../../i18n/i18n';
import { buildTagHierarchy } from '../../tasks/tags/TagHierarchyBuilder';
import type { TagNode } from '../../tasks/tags/TagHierarchy';

export interface TagFilterOptions {
	getCurrentState: () => TagFilterState;
	onTagFilterChange: (newState: TagFilterState) => void;
	getAllTasks: () => GCTask[];
}

function extractAllTags(tasks: GCTask[]): Map<string, number> {
	const tagCounts = new Map<string, number>();
	const originalTagMap = new Map<string, string>();

	for (const task of tasks) {
		if (!task.tags || task.tags.length === 0) continue;

		for (const tag of task.tags) {
			const normalized = tag.toLowerCase().trim();
			if (!originalTagMap.has(normalized)) {
				originalTagMap.set(normalized, tag);
			}
			tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + 1);
		}
	}

	const result = new Map<string, number>();
	originalTagMap.forEach((originalTag, normalized) => {
		result.set(originalTag, tagCounts.get(normalized)!);
	});

	return result;
}

/** 计算节点的聚合计数（自身 + 所有子节点） */
function computeAggregatedCount(node: TagNode, directCounts: Map<string, number>): number {
	const direct = directCounts.get(node.fullPath) || 0;
	let total = direct;
	for (const child of node.children) {
		total += computeAggregatedCount(child, directCounts);
	}
	return total;
}

/** 按聚合计数降序排序节点，计数相同则按名称排序 */
function sortNodesByCount(nodes: TagNode[], aggCounts: Map<string, number>): TagNode[] {
	return [...nodes].sort((a, b) => {
		const diff = (aggCounts.get(b.fullPath) || 0) - (aggCounts.get(a.fullPath) || 0);
		return diff !== 0 ? diff : a.name.localeCompare(b.name);
	});
}

export function renderTagFilterButton(
	container: HTMLElement,
	options: TagFilterOptions
): { cleanup: () => void } {
	const { getCurrentState, onTagFilterChange, getAllTasks } = options;
	const classes = ToolbarClasses.components.tagFilter;

	// 展开/折叠状态（路径集合）
	const expandedPaths = new Set<string>();

	// 创建下凹底座容器
	const buttonGroup = container.createDiv(ToolbarClasses.components.navButtons.group);
	buttonGroup.addClass(ToolbarClasses.priority.priority2);

	// 创建标签筛选按钮
	const tagBtn = buttonGroup.createDiv({
		cls: ToolbarClasses.components.navButtons.btn,
		attr: { 'aria-label': i18n.t('toolbar.tagFilter.ariaLabel') }
	});

	const iconSpan = tagBtn.createSpan(classes.icon);
	setIcon(iconSpan, 'tags');

	// 创建下拉面板
	const dropdown = document.createElement('div');
	dropdown.addClass(classes.pane);
	dropdown.style.display = 'none';
	document.body.appendChild(dropdown);

	let andBtnElement: HTMLElement | null = null;
	let orBtnElement: HTMLElement | null = null;
	let notBtnElement: HTMLElement | null = null;

	const updateOperatorButtons = () => {
		const state = getCurrentState();
		andBtnElement?.toggleClass(classes.operatorBtnActive, state.operator === 'AND');
		orBtnElement?.toggleClass(classes.operatorBtnActive, state.operator === 'OR');
		notBtnElement?.toggleClass(classes.operatorBtnActive, state.operator === 'NOT');
	};

	/** 递归渲染标签树节点 */
	const renderTreeNode = (
		parent: HTMLElement,
		node: TagNode,
		state: TagFilterState,
		aggCounts: Map<string, number>,
		level: number
	) => {
		const isSelected = state.selectedTags.includes(node.fullPath);
		const hasChildren = node.children.length > 0;
		const isExpanded = expandedPaths.has(node.fullPath);
		const aggCount = aggCounts.get(node.fullPath) || 0;

		// 跳过聚合计数为 0 的中间节点
		if (aggCount === 0 && hasChildren) return;

		const item = parent.createEl('div', {
			cls: classes.tagItem
		});
		if (isSelected) item.addClass(classes.tagItemSelected);
		if (hasChildren) item.addClass(classes.tagItemHasChildren);
		item.addClass(classes.tagLevel(level));

		// 展开/折叠箭头（仅当有子节点时显示）
		if (hasChildren) {
			const toggle = item.createEl('span', classes.tagToggle);
			if (isExpanded) toggle.addClass(classes.tagToggleExpanded);
			setIcon(toggle, isExpanded ? 'chevron-down' : 'chevron-right');
			toggle.addEventListener('click', (e) => {
				e.stopPropagation();
				if (isExpanded) {
					expandedPaths.delete(node.fullPath);
				} else {
					expandedPaths.add(node.fullPath);
				}
				renderDropdown();
			});
		} else {
			// 占位，保持对齐
			const spacer = item.createEl('span', classes.tagToggle);
			spacer.style.opacity = '0';
			spacer.style.cursor = 'default';
		}

		// 复选框
		const checkbox = item.createEl('span', classes.tagCheckbox);
		if (isSelected) {
			setIcon(checkbox, 'check');
		}

		// 标签名
		const label = item.createEl('span', classes.tagName);
		label.setText(`#${node.fullPath}`);

		// 数量
		const countEl = item.createEl('span', classes.tagCount);
		countEl.setText(String(aggCount));

		// 点击切换选中
		item.addEventListener('click', (e) => {
			e.stopPropagation();
			const s = getCurrentState();
			const newSelected = [...s.selectedTags];
			const idx = newSelected.indexOf(node.fullPath);

			if (idx >= 0) {
				newSelected.splice(idx, 1);
			} else {
				newSelected.push(node.fullPath);
			}

			onTagFilterChange({ ...s, selectedTags: newSelected });
			renderDropdown();
		});

		// 子节点容器（展开时渲染）
		if (hasChildren && isExpanded) {
			const childrenContainer = parent.createEl('div', classes.tagChildren);
			const sortedChildren = sortNodesByCount(node.children, aggCounts);
			for (const child of sortedChildren) {
				renderTreeNode(childrenContainer, child, state, aggCounts, level + 1);
			}
		}
	};

	const renderDropdown = () => {
		dropdown.empty();

		const state = getCurrentState();
		const allTasks = getAllTasks();
		const tagCounts = extractAllTags(allTasks);

		// 面板头部
		const header = dropdown.createEl('div', classes.dropdownHeader);
		header.createEl('span', { text: i18n.t('toolbar.tagFilter.header') });

		// 组合器按钮行
		const operators = dropdown.createEl('div', classes.operators);

		const createOpBtn = (text: string, op: 'AND' | 'OR' | 'NOT', title: string) => {
			const btn = operators.createDiv({
				text,
				cls: classes.operatorBtn,
				attr: { title, 'aria-label': `${text} ${i18n.t('toolbar.tagFilter.ariaLabel')}`, 'role': 'button', 'tabindex': '0' }
			});
			if (state.operator === op) btn.addClass(classes.operatorBtnActive);
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				const s = getCurrentState();
				if (s.operator !== op) {
					onTagFilterChange({ ...s, operator: op });
					updateOperatorButtons();
				}
			});
			return btn;
		};

		andBtnElement = createOpBtn('AND', 'AND', i18n.t('toolbar.tagFilter.andTitle'));
		orBtnElement = createOpBtn('OR', 'OR', i18n.t('toolbar.tagFilter.orTitle'));
		notBtnElement = createOpBtn('NOT', 'NOT', i18n.t('toolbar.tagFilter.notTitle'));

		// 标签树
		const list = dropdown.createEl('div', classes.tagsGrid);

		if (tagCounts.size === 0) {
			list.createEl('div', { text: i18n.t('toolbar.tagFilter.empty'), cls: classes.empty });
			return;
		}

		// 构建标签树
		const flatTags = Array.from(tagCounts.keys());
		const tree = buildTagHierarchy(flatTags);

		// 计算每个节点的聚合计数
		const aggCounts = new Map<string, number>();
		const computeAll = (nodes: TagNode[]) => {
			for (const node of nodes) {
				aggCounts.set(node.fullPath, computeAggregatedCount(node, tagCounts));
				computeAll(node.children);
			}
		};
		computeAll(tree);

		// 渲染树（根节点按聚合计数降序排列）
		const sortedRoots = sortNodesByCount(tree, aggCounts);
		for (const rootNode of sortedRoots) {
			renderTreeNode(list, rootNode, state, aggCounts, 0);
		}
	};

	// 切换面板显示
	tagBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const isVisible = dropdown.style.display !== 'none';
		if (isVisible) {
			dropdown.style.display = 'none';
		} else {
			renderDropdown();
			const rect = tagBtn.getBoundingClientRect();
			dropdown.style.top = `${rect.bottom + 4}px`;
			dropdown.style.left = `${rect.left}px`;
			dropdown.style.display = 'block';
		}
	});

	// 点击外部关闭
	const closeOnClickOutside = (e: MouseEvent) => {
		if (!dropdown.contains(e.target as Node) && !tagBtn.contains(e.target as Node)) {
			dropdown.style.display = 'none';
		}
	};
	document.addEventListener('click', closeOnClickOutside);

	const cleanup = () => {
		document.removeEventListener('click', closeOnClickOutside);
		dropdown.remove();
	};

	return { cleanup };
}

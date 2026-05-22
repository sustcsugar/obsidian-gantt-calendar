/**
 * @fileoverview 标签筛选按钮组件
 * @module toolbar/components/tag-filter
 */

import { setIcon } from 'obsidian';
import type { GCTask } from '../../types';
import type { TagFilterState } from '../../types';
import { ToolbarClasses } from '../../utils/bem';
import { i18n } from '../../i18n/i18n';

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

export function renderTagFilterButton(
	container: HTMLElement,
	options: TagFilterOptions
): { cleanup: () => void } {
	const { getCurrentState, onTagFilterChange, getAllTasks } = options;
	const classes = ToolbarClasses.components.tagFilter;

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

		// 标签列表
		const list = dropdown.createEl('div', classes.tagsGrid);

		const sortedTags = Array.from(tagCounts.entries())
			.sort((a, b) => b[1] - a[1]);

		if (sortedTags.length === 0) {
			list.createEl('div', { text: i18n.t('toolbar.tagFilter.empty'), cls: classes.empty });
			return;
		}

		for (const [tag, count] of sortedTags) {
			const isSelected = state.selectedTags.includes(tag);

			const item = list.createEl('div', {
				cls: `${classes.tagItem} ${isSelected ? classes.tagItemSelected : ''}`
			});

			// 复选框
			const checkbox = item.createEl('span', classes.tagCheckbox);
			if (isSelected) {
				setIcon(checkbox, 'check');
			}

			// 标签名
			const label = item.createEl('span', classes.tagName);
			label.setText(`#${tag}`);

			// 数量
			const countEl = item.createEl('span', classes.tagCount);
			countEl.setText(String(count));

			item.addEventListener('click', (e) => {
				e.stopPropagation();
				const s = getCurrentState();
				const newSelected = [...s.selectedTags];
				const idx = newSelected.indexOf(tag);

				if (idx >= 0) {
					newSelected.splice(idx, 1);
				} else {
					newSelected.push(tag);
				}

				onTagFilterChange({ ...s, selectedTags: newSelected });
				renderDropdown();
			});
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

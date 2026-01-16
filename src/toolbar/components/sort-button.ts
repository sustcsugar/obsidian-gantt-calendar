/**
 * @fileoverview 排序下拉按钮组件
 * @module toolbar/components/sort-button
 */

import { setIcon } from 'obsidian';
import type { SortState } from '../../types';
import { SORT_OPTIONS, getSortDisplayText, updateSortState } from '../../tasks/taskSorter';
import { ToolbarClasses } from '../../utils/bem';

/**
 * 排序按钮配置选项
 */
export interface SortButtonOptions {
	/** 获取当前排序状态的函数 */
	getCurrentState: () => SortState;
	/** 排序状态变化回调 */
	onSortChange: (newState: SortState) => void;
}

/**
 * 渲染排序下拉按钮
 *
 * 特性：
 * - 点击按钮显示/隐藏下拉菜单
 * - 点击菜单项后菜单保持打开（允许继续切换）
 * - 点击菜单外部区域关闭菜单
 * - 同一字段点击循环切换升序/降序
 *
 * @param container 容器元素
 * @param options 配置选项
 * @returns 清理函数对象
 */
export function renderSortButton(
	container: HTMLElement,
	options: SortButtonOptions
): { cleanup: () => void } {
	const { getCurrentState, onSortChange } = options;

	// 创建下凹底座容器（与导航按钮组样式一致）
	const buttonGroup = container.createDiv(ToolbarClasses.components.navButtons.group);
	// 添加响应式优先级类（第一优先级隐藏）
	buttonGroup.addClass(ToolbarClasses.priority.priority1);

	// 创建排序按钮
	const sortBtn = buttonGroup.createEl('button', {
		cls: ToolbarClasses.components.navButtons.btn,
		attr: { title: '排序选项' }
	});

	// 更新按钮显示内容的函数
	const updateButtonDisplay = () => {
		const currentState = getCurrentState();
		sortBtn.empty();
		const iconSpan = sortBtn.createSpan(ToolbarClasses.components.sort.icon);
		iconSpan.setText(getSortDisplayText(currentState));
		const dropdownIcon = sortBtn.createSpan(ToolbarClasses.components.sort.dropdownIcon);
		setIcon(dropdownIcon, 'chevron-down');
	};

	// 更新菜单项激活状态的函数
	const updateMenuActiveStates = () => {
		const currentState = getCurrentState();
		menuItems.forEach((item, index) => {
			const option = SORT_OPTIONS[index];
			const indicator = item.querySelector(`.${ToolbarClasses.components.sort.optionIndicator}`) as HTMLElement;

			if (currentState.field === option.field) {
				item.addClass(ToolbarClasses.components.sort.menuItemActive);
				indicator.textContent = currentState.order === 'asc' ? '⬆️' : '⬇️';
			} else {
				item.removeClass(ToolbarClasses.components.sort.menuItemActive);
				indicator.textContent = '';
			}
		});
	};

	updateButtonDisplay();

	// 创建下拉菜单（添加到 body 以便正确定位）
	const dropdown = document.createElement('div');
	dropdown.addClass(ToolbarClasses.components.sort.dropdown);
	dropdown.style.display = 'none';

	// 添加菜单标题
	dropdown.createEl('div', { text: '排序方式 (点击切换)', cls: ToolbarClasses.components.sort.dropdownHeader });

	const menuItems: HTMLElement[] = [];

	// 添加各个排序选项
	SORT_OPTIONS.forEach((option) => {
		const item = dropdown.createEl('div', { cls: ToolbarClasses.components.sort.menuItem });

		const iconSpan = item.createSpan(ToolbarClasses.components.sort.optionIcon);
		iconSpan.setText(option.icon);

		const labelSpan = item.createSpan(ToolbarClasses.components.sort.optionLabel);
		labelSpan.setText(option.label);

		const indicator = item.createSpan(ToolbarClasses.components.sort.optionIndicator);

		item.addEventListener('click', (e) => {
			e.stopPropagation();

			// 每次点击时获取最新状态
			const currentState = getCurrentState();
			const newState = updateSortState(currentState, option.field);
			onSortChange(newState);

			// 更新激活状态
			updateMenuActiveStates();

			// 更新按钮显示
			updateButtonDisplay();
		});

		menuItems.push(item);
	});

	// 初始化菜单激活状态
	updateMenuActiveStates();

	// 将菜单添加到 body
	document.body.appendChild(dropdown);

	// 切换菜单显示/隐藏
	sortBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const isVisible = dropdown.style.display !== 'none';
		if (isVisible) {
			dropdown.style.display = 'none';
		} else {
			// 每次打开菜单时更新状态
			updateMenuActiveStates();
			updateButtonDisplay();

			const rect = sortBtn.getBoundingClientRect();
			dropdown.style.top = `${rect.bottom + 4}px`;
			dropdown.style.left = `${rect.left}px`;
			dropdown.style.display = 'block';
		}
	});

	// 点击外部关闭菜单
	const closeDropdown = (e: MouseEvent) => {
		if (!dropdown.contains(e.target as Node) && !sortBtn.contains(e.target as Node)) {
			dropdown.style.display = 'none';
		}
	};

	document.addEventListener('click', closeDropdown);

	// 清理函数
	const cleanup = () => {
		document.removeEventListener('click', closeDropdown);
		dropdown.remove();
	};

	return { cleanup };
}

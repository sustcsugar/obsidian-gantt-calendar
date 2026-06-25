import { setIcon } from 'obsidian';
import type { StatusFilterState } from '../../types';
import type { TaskStatus } from '../../tasks/taskStatus';
import { setCssProps, ToolbarClasses } from '../../utils/bem';
import { getStatusColor } from '../../tasks/taskStatus';
import { i18n } from '../../i18n/i18n';

/** 状态筛选按钮选项 */
export interface StatusFilterButtonOptions {
	getCurrentState: () => StatusFilterState;
	onStatusFilterChange: (state: StatusFilterState) => void;
	getAvailableStatuses: () => TaskStatus[];
}

/**
 * 渲染状态筛选按钮（复选框多选模式，现代 UI 设计）
 */
export function renderStatusFilterButton(
	container: HTMLElement,
	options: StatusFilterButtonOptions
): { cleanup: () => void } {
	const { getCurrentState, onStatusFilterChange, getAvailableStatuses } = options;
	const classes = ToolbarClasses.components.statusFilter;

	// 1. 创建下凹底座容器（与导航按钮组样式一致）
	const buttonGroup = container.createDiv(ToolbarClasses.components.navButtons.group);
	// 添加响应式优先级类（第一优先级隐藏）
	buttonGroup.addClass(ToolbarClasses.priority.priority1);

	// 2. 创建筛选按钮
	const statusBtn = buttonGroup.createEl('button', {
		cls: ToolbarClasses.components.navButtons.btn,
		attr: { 'aria-label': i18n.t('toolbar.statusFilter.ariaLabel') }
	});

	// 3. 按钮内容：图标 - 使用线条风格的复选框图标
	const iconSpan = statusBtn.createSpan(classes.icon);
	setIcon(iconSpan, 'check-square');

	// 5. 创建下拉面板
	const dropdown = activeDocument.createElement('div');
	dropdown.addClass(classes.dropdown, 'gc-u-hidden');
	activeDocument.body.appendChild(dropdown);

	// 6. 渲染面板内容
	const renderDropdown = () => {
		dropdown.empty();

		// 面板头部
		const header = dropdown.createEl('div', classes.dropdownHeader);
		header.createEl('span', { text: i18n.t('toolbar.statusFilter.header') });

		const state = getCurrentState();
		const allStatuses = getAvailableStatuses();

		// 选项列表（纵向单列）
		const list = dropdown.createEl('div', classes.statusList);

		if (allStatuses.length === 0) {
			list.createEl('div', { text: i18n.t('toolbar.statusFilter.empty'), cls: classes.empty });
			return;
		}

		for (const statusConfig of allStatuses) {
			const isSelected = state.selectedStatuses.includes(statusConfig.key);

			const item = list.createEl('div', {
				cls: [classes.statusItem, isSelected ? classes.statusItemSelected : ''].join(' ')
			});

			// 复选框
			const checkbox = item.createEl('span', classes.statusCheckbox);
			if (isSelected) {
				setIcon(checkbox, 'check');
			}

			// 状态名称 - 应用背景色和文字颜色
			const label = item.createEl('span', classes.statusLabel);
			label.setText(statusConfig.name);
			const colors = getStatusColor(statusConfig.key, [statusConfig]);
			if (colors) {
				setCssProps(label, { backgroundColor: colors.bg, color: colors.text });
			}

			// 点击事件 - 阻止冒泡，保持弹窗打开
			item.addEventListener('click', (e) => {
				e.stopPropagation();
				const currentState = getCurrentState();
				const newSelected = [...currentState.selectedStatuses];
				const idx = newSelected.indexOf(statusConfig.key);

				if (idx >= 0) {
					newSelected.splice(idx, 1);
				} else {
					newSelected.push(statusConfig.key);
				}

				onStatusFilterChange({ selectedStatuses: newSelected });
				renderDropdown();
			});
		}
	};

	// 7. 切换下拉显示
	statusBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const isVisible = !dropdown.hasClass('gc-u-hidden');
		if (isVisible) {
			dropdown.addClass('gc-u-hidden');
		} else {
			renderDropdown();
			const rect = statusBtn.getBoundingClientRect();
			setCssProps(dropdown, { top: `${rect.bottom + 4}px`, left: `${rect.left}px` });
			dropdown.removeClass('gc-u-hidden');
		}
	});

	// 8. 点击外部关闭
	const closeOnClickOutside = (e: MouseEvent) => {
		if (!dropdown.contains(e.target as Node) && !statusBtn.contains(e.target as Node)) {
			dropdown.addClass('gc-u-hidden');
		}
	};
	activeDocument.addEventListener('click', closeOnClickOutside);

	// 9. 清理函数
	const cleanup = () => {
		activeDocument.removeEventListener('click', closeOnClickOutside);
		dropdown.remove();
	};

	return { cleanup };
}

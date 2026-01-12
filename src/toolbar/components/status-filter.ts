import type { StatusFilterState } from '../../types';
import type { TaskStatus } from '../../tasks/taskStatus';
import { ToolbarClasses } from '../../utils/bem';

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

	// 1. 创建按钮容器
	const buttonContainer = container.createDiv(classes.container);

	// 2. 创建筛选按钮
	const statusBtn = buttonContainer.createEl('button', {
		cls: classes.btn,
		attr: { title: '状态筛选', 'aria-label': '状态筛选', 'data-tooltip': '状态筛选' }
	});

	// 3. 按钮内容：图标 + 徽章
	const iconSpan = statusBtn.createSpan(classes.icon);
	iconSpan.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
		<path d="M3 4.5h10a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5z"/>
		<path d="M7 2h2a1 1 0 0 1 1 1v1H6V3a1 1 0 0 1 1-1z"/>
	</svg>`;

	const countBadge = statusBtn.createSpan(classes.count);
	countBadge.style.display = 'none';

	// 4. 更新按钮状态
	const updateButtonState = () => {
		const state = getCurrentState();
		const count = state.selectedStatuses.length;

		if (count > 0) {
			countBadge.setText(String(count));
			countBadge.style.display = 'inline-flex';
			statusBtn.addClass(classes.btnHasSelection);
		} else {
			countBadge.style.display = 'none';
			statusBtn.removeClass(classes.btnHasSelection);
		}
	};

	// 5. 创建下拉面板
	const dropdown = document.createElement('div');
	dropdown.addClass(classes.dropdown);
	dropdown.style.display = 'none';
	document.body.appendChild(dropdown);

	// 6. 渲染面板内容
	const renderDropdown = () => {
		dropdown.empty();

		// 面板头部
		const header = dropdown.createEl('div', classes.dropdownHeader);
		header.createEl('span', { text: '筛选状态' });

		const state = getCurrentState();
		const allStatuses = getAvailableStatuses();

		// 选项列表（纵向单列）
		const list = dropdown.createEl('div', classes.statusList);

		if (allStatuses.length === 0) {
			list.createEl('div', { text: '暂无可用状态', cls: classes.empty });
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
				checkbox.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
					<rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
					<path d="M4 8l3 3 6-6" stroke="currentColor" stroke-width="1.5" fill="none"/>
				</svg>`;
			} else {
				checkbox.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
					<rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
				</svg>`;
			}

			// 状态名称 - 应用背景色和文字颜色
			const label = item.createEl('span', classes.statusLabel);
			label.setText(statusConfig.name);
			label.style.backgroundColor = statusConfig.backgroundColor;
			label.style.color = statusConfig.textColor;

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
				updateButtonState();
				renderDropdown();
			});
		}
	};

	// 7. 切换下拉显示
	statusBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const isVisible = dropdown.style.display !== 'none';
		if (isVisible) {
			dropdown.style.display = 'none';
		} else {
			renderDropdown();
			const rect = statusBtn.getBoundingClientRect();
			dropdown.style.top = `${rect.bottom + 6}px`;
			dropdown.style.right = `${window.innerWidth - rect.right}px`;
			dropdown.style.display = 'block';
		}
	});

	// 8. 点击外部关闭
	const closeOnClickOutside = (e: MouseEvent) => {
		if (!dropdown.contains(e.target as Node) && !statusBtn.contains(e.target as Node)) {
			dropdown.style.display = 'none';
		}
	};
	document.addEventListener('click', closeOnClickOutside);

	// 9. 清理函数
	const cleanup = () => {
		document.removeEventListener('click', closeOnClickOutside);
		dropdown.remove();
	};

	return { cleanup };
}

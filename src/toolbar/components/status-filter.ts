import { ToolbarClasses } from '../../utils/bem';

export type StatusValue = 'all' | 'completed' | 'uncompleted';

/**
 * 渲染可复用的状态筛选下拉框
 */
export function renderStatusFilter(
	container: HTMLElement,
	current: StatusValue,
	onChange: (v: StatusValue) => void
): void {
	const group = container.createDiv(ToolbarClasses.components.statusFilter.groupGantt);
	group.createEl('span', { text: '状态', cls: ToolbarClasses.components.statusFilter.label });

	const select = group.createEl('select', { cls: ToolbarClasses.components.statusFilter.select });
	select.innerHTML = `
		<option value="all">全部</option>
		<option value="uncompleted">未完成</option>
		<option value="completed">已完成</option>
	`;
	select.value = current;
	select.addEventListener('change', (e) => {
		const v = (e.target as HTMLSelectElement).value as StatusValue;
		onChange(v);
	});
}

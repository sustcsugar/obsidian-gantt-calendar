import { setIcon } from 'obsidian';
import { ToolbarClasses } from '../../utils/bem';

/**
 * 渲染设置按钮（齿轮图标）
 * 点击后直接打开插件设置界面
 */
export function renderSettingsButton(
	container: HTMLElement,
	plugin: any
): void {
	const buttonGroup = container.createDiv(ToolbarClasses.components.navButtons.group);

	const btn = buttonGroup.createEl('button', {
		cls: ToolbarClasses.components.navButtons.btn,
		attr: { 'aria-label': '插件设置' }
	});
	setIcon(btn, 'settings');
	btn.addEventListener('click', () => {
		plugin?.app?.setting?.open();
		plugin?.app?.setting?.openTabById('gantt-calendar');
	});
}

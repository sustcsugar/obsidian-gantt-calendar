import { setIcon, App } from 'obsidian';
import { ToolbarClasses } from '../../utils/bem';
import { i18n } from '../../i18n/i18n';
import type { IPluginContext } from '../../types';

/**
 * 渲染设置按钮（齿轮图标）
 * 点击后直接打开插件设置界面
 */
export function renderSettingsButton(
	container: HTMLElement,
	plugin: IPluginContext
): void {
	const buttonGroup = container.createDiv(ToolbarClasses.components.navButtons.group);

	const btn = buttonGroup.createEl('button', {
		cls: ToolbarClasses.components.navButtons.btn,
		attr: { 'aria-label': i18n.t('toolbar.settingsButton.ariaLabel') }
	});
	setIcon(btn, 'settings');
	btn.addEventListener('click', () => {
		const appWithSetting = plugin?.app as App & { setting?: { open(): void; openTabById(id: string): void } };
		appWithSetting?.setting?.open();
		appWithSetting?.setting?.openTabById('gantt-calendar');
	});
}

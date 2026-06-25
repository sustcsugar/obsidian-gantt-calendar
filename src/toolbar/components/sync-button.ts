import { setIcon } from 'obsidian';
import { ToolbarClasses } from '../../utils/bem';
import { i18n } from '../../i18n/i18n';

/**
 * 渲染飞书同步按钮
 * 点击后执行与命令面板"飞书任务双向同步"完全一致的同步流程
 */
export function renderSyncButton(
	container: HTMLElement,
	onSync: () => Promise<void>,
	title: string = i18n.t('toolbar.syncButton.defaultTitle')
): void {
	const buttonGroup = container.createDiv(ToolbarClasses.components.navButtons.group);

	const btn = buttonGroup.createEl('button', {
		cls: ToolbarClasses.components.navButtons.btn,
		attr: { 'aria-label': title }
	});
	setIcon(btn, 'cloud-download');
	btn.addEventListener('click', () => { void onSync(); });
}

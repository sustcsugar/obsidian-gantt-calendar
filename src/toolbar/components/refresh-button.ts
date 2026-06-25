import { setIcon } from 'obsidian';
import { ToolbarClasses } from '../../utils/bem';
import { i18n } from '../../i18n/i18n';

/**
 * 渲染共享的刷新按钮
 * 使用与导航按钮相同的下凹底座样式
 */
export function renderRefreshButton(
  container: HTMLElement,
  onRefresh: () => Promise<void>,
  title: string = i18n.t('toolbar.refresh.defaultTitle')
): void {
  // 创建下凹底座容器（与导航按钮组样式一致）
  const buttonGroup = container.createDiv(ToolbarClasses.components.navButtons.group);

  const btn = buttonGroup.createEl('button', {
    cls: ToolbarClasses.components.navButtons.btn,
    attr: { 'aria-label': title }
  });
  setIcon(btn, 'rotate-ccw');
  btn.addEventListener('click', () => { void onRefresh(); });
}

import { setIcon } from 'obsidian';
import { ToolbarClasses } from '../../utils/bem';

/**
 * 渲染共享的刷新按钮
 * 使用与导航按钮相同的下凹底座样式
 */
export function renderRefreshButton(
  container: HTMLElement,
  onRefresh: () => Promise<void>,
  title: string = '刷新'
): void {
  // 创建下凹底座容器（与导航按钮组样式一致）
  const buttonGroup = container.createDiv(ToolbarClasses.components.navButtons.group);

  const btn = buttonGroup.createEl('button', {
    cls: ToolbarClasses.components.navButtons.btn,
    attr: { title, 'aria-label': title }
  });
  setIcon(btn, 'rotate-ccw');
  btn.addEventListener('click', onRefresh);
}

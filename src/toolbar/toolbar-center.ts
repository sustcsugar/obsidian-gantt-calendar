import { ToolbarClasses } from '../utils/bem';

/**
 * 工具栏中间区域 - 信息展示区
 * 负责显示日期范围、标题等信息
 */
export class ToolbarCenter {
	/**
	 * 渲染中间区域
	 * @param container 中间容器元素（类名已在 toolbar.ts 中设置）
	 * @param titleText 标题文本
	 */
	render(
		container: HTMLElement,
		titleText: string
	): void {
		container.empty();

		const titleDisplay = container.createEl('span');
		titleDisplay.addClass(ToolbarClasses.components.titleDisplay);
		titleDisplay.setText(titleText);
	}
}

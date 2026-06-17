/**
 * 主题管理器
 *
 * 负责主题变化监听和通知
 */

/**
 * 主题管理器
 */
export class ThemeManager {
	private unregisterFn?: () => void;

	/**
	 * 初始化主题监听
	 * @param callback 主题切换时的回调函数
	 */
	initialize(callback: () => void): void {
		// 使用 MutationObserver 监听 body classList 变化
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
					// 主题切换时执行回调
					callback();
					break;
				}
			}
		});

		observer.observe(activeDocument.body, {
			attributes: true,
			attributeFilter: ['class']
		});

		// 保存取消监听的函数
		this.unregisterFn = () => observer.disconnect();
	}

	/**
	 * 销毁主题监听器
	 */
	destroy(): void {
		if (this.unregisterFn) {
			this.unregisterFn();
			this.unregisterFn = undefined;
		}
	}
}

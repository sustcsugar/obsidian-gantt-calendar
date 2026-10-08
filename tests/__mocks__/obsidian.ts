// Minimal mock for Obsidian module used in tests
export class App {}
export class TFile {
	path = "";
}
export class Plugin {
	app: unknown;
	constructor(app?: unknown) { this.app = app; }
}
export class MarkdownRenderer {
	static render(_app: App, _markdown: string, _el: HTMLElement, _path: string): void {}
}

/** 视图基类桩：提供 onOpen/onClose 链所需的 DOM 挂载点（P0 启动解耦测试用） */
export class ItemView {
	contentEl: HTMLElement = {} as HTMLElement;
	containerEl: HTMLElement = { isConnected: true } as HTMLElement;
	constructor(_leaf: unknown) {}
	getViewType(): string { return ''; }
	getDisplayText(): string { return ''; }
	getIcon(): string { return ''; }
	onOpen(): Promise<void> { return Promise.resolve(); }
	onClose(): Promise<void> { return Promise.resolve(); }
}

/** 平台标志桩（组件模块级访问 Platform.isMobile 等） */
export const Platform = {
	isDesktop: true,
	isDesktopApp: true,
	isMobile: false,
	isMobileApp: false,
	isPhone: false,
	isTablet: false,
};

/** 模态框基类桩（命令模块在类定义处 extends Modal） */
export class Modal {
	contentEl: HTMLElement = {} as HTMLElement;
	constructor(_app?: unknown, _container?: unknown) {}
	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

/** 常用工具函数桩 */
export function setIcon(_el: HTMLElement, _icon: string): void {}
export function getLanguage(): string { return 'en'; }
export class Notice {
	constructor(_message: string, _timeout?: number) {}
}


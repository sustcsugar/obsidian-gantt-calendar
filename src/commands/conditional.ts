import { Modal, App, MarkdownView } from 'obsidian';
import type GanttCalendarPlugin from '../../main';

/**
 * 示例模态框
 */
class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * 注册条件命令（条件判断后执行）
 * @param plugin 插件实例
 */
export function registerConditionalCommands(plugin: GanttCalendarPlugin): void {
	// 简单命令示例
	plugin.addCommand({
		id: 'open-sample-modal',
		name: 'Open sample modal (simple)',
		callback: () => {
			new SampleModal(plugin.app).open();
		}
	});

	// 条件命令示例：仅在活跃视图为 MarkdownView 时可用
	plugin.addCommand({
		id: 'open-sample-modal-conditional',
		name: 'Open sample modal (complex)',
		checkCallback: (checking: boolean) => {
			const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (markdownView) {
				if (!checking) {
					new SampleModal(plugin.app).open();
				}
				return true;
			}
			return false;
		}
	});
}

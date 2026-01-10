import { Editor, MarkdownView } from 'obsidian';
import type GanttCalendarPlugin from '../../main';

/**
 * 注册编辑器命令（编辑相关操作）
 * @param plugin 插件实例
 */
export function registerEditorCommands(plugin: GanttCalendarPlugin): void {
	// 编辑器命令示例
	plugin.addCommand({
		id: 'gantt-calendar-editor',
		name: 'Sample editor command',
		editorCallback: (editor: Editor, _view: MarkdownView) => {
			editor.replaceSelection('Sample Editor Command');
		}
	});
}

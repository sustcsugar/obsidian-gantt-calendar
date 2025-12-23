/**
 * 任务搜索模块
 *
 * 功能：
 *   - 提供 searchTasks 方法，从整个 Obsidian 笔记库中检索所有符合全局筛选条件的任务。
 *   - 支持 Tasks 格式、Dataview 格式或两者混合的任务解析。
 *   - 结果按文件名和行号排序，便于前端展示。
 *
 * 实现方式：
 *   - 遍历所有 Markdown 文件，利用 metadataCache 获取列表项。
 *   - 仅对包含任务列表的文件进行内容读取和解析。
 *   - 解析逻辑委托给 parseTasksFromListItems（见 parser.ts）。
 *   - 支持通过 enabledFormats 参数灵活切换解析格式。
 */
import { App } from 'obsidian';
import { GanttTask } from '../types';
import { parseTasksFromListItems } from './parser';

/**
 * 从笔记库中搜索所有符合全局筛选条件的任务
 */
export async function searchTasks(app: App, globalTaskFilter: string, enabledFormats?: string[]): Promise<GanttTask[]> {
	const tasks: GanttTask[] = [];
	const markdownFiles = app.vault.getMarkdownFiles();
	const formats = enabledFormats || ['tasks', 'dataview'];

	for (const file of markdownFiles) {
		const fileCache = app.metadataCache.getFileCache(file);
		const listItems = fileCache?.listItems;
		if (!listItems || listItems.length === 0) {
			continue;
		}
		const content = await app.vault.read(file);
		const lines = content.split('\n');
		const parsed = parseTasksFromListItems(file, lines, listItems, formats, globalTaskFilter);
		tasks.push(...parsed);
	}

	return tasks.sort((a, b) => {
		if (a.fileName !== b.fileName) {
			return a.fileName.localeCompare(b.fileName);
		}
		return a.lineNumber - b.lineNumber;
	});
}

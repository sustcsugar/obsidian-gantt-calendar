import { App, TFile, ListItemCache } from 'obsidian';
import { GanttTask } from '../types';

/**
 * 解析 Tasks 插件格式日期和优先级（使用emoji表示）
 * 优先级: 🔺 highest, ⏫ high, 🔼 medium, 🔽 low, ⏬ lowest
 * 日期: ➕ 创建日期, 🛫 开始日期, ⏳ 计划日期, 📅 due日期, ❌ 取消日期, ✅ 完成日期
 * @returns 返回true表示匹配到Tasks格式
 */
export function parseTasksFormat(content: string, task: GanttTask): boolean {
	if (content.includes('🔺')) {
		task.priority = 'highest';
	} else if (content.includes('⏫')) {
		task.priority = 'high';
	} else if (content.includes('🔼')) {
		task.priority = 'medium';
	} else if (content.includes('🔽')) {
		task.priority = 'low';
	} else if (content.includes('⏬')) {
		task.priority = 'lowest';
	}
	const dateRegex = /(➕|🛫|⏳|📅|❌|✅)\s*(\d{4}-\d{2}-\d{2})/g;
	let match;
	while ((match = dateRegex.exec(content)) !== null) {
		const [, emoji, dateStr] = match;
		const date = new Date(dateStr);
		switch (emoji) {
			case '➕': task.createdDate = date; break;
			case '🛫': task.startDate = date; break;
			case '⏳': task.scheduledDate = date; break;
			case '📅': task.dueDate = date; break;
			case '❌': task.cancelledDate = date; break;
			case '✅': task.completionDate = date; break;
		}
	}
	const hasTasksFormat = /([➕🛫⏳📅❌✅])\s*\d{4}-\d{2}-\d{2}/.test(content) || /[🔺⏫🔼🔽⏬]/.test(content);
	if (hasTasksFormat) {
		task.format = 'tasks';
	}
	return hasTasksFormat;
}

/**
 * 解析 Dataview 插件格式日期和优先级（使用字段表示）
 * [priority:: ...], [created:: ...], [start:: ...], [scheduled:: ...], [due:: ...], [cancelled:: ...], [completion:: ...]
 * @returns 返回true表示匹配到Dataview格式
 */
export function parseDataviewFormat(content: string, task: GanttTask): boolean {
	const fieldRegex = /\[(priority|created|start|scheduled|due|cancelled|completion)::\s*([^\]]+)\]/g;
	let match;
	while ((match = fieldRegex.exec(content)) !== null) {
		const [, field, value] = match;
		const trimmedValue = value.trim();
		switch (field) {
			case 'priority':
				const priorityValue = trimmedValue.toLowerCase();
				if ([
					'highest', 'high', 'medium', 'low', 'lowest'
				].includes(priorityValue)) {
					task.priority = priorityValue;
				}
				break;
			case 'created':
			case 'start':
			case 'scheduled':
			case 'due':
			case 'cancelled':
			case 'completion':
				const date = new Date(trimmedValue);
				if (isNaN(date.getTime())) continue;
				if (field === 'created') task.createdDate = date;
				else if (field === 'start') task.startDate = date;
				else if (field === 'scheduled') task.scheduledDate = date;
				else if (field === 'due') task.dueDate = date;
				else if (field === 'cancelled') task.cancelledDate = date;
				else if (field === 'completion') task.completionDate = date;
				break;
		}
	}
	const hasDataviewFormat = /\[(priority|created|start|scheduled|due|cancelled|completion)::\s*[^\]]+\]/.test(content);
	if (hasDataviewFormat) {
		task.format = 'dataview';
	}
	return hasDataviewFormat;
}

/**
 * 转义正则表达式中的特殊字符
 */
export function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 提取任务描述（移除所有元数据标记）
 * 从任务内容中提取纯文本描述，移除：
 * - Tasks 格式的优先级 emoji (🔺⏫🔼🔽⏬)
 * - Tasks 格式的日期 emoji + 日期值 (➕🛫⏳📅❌✅ + 日期)
 * - Dataview 格式的字段 ([field:: value])
 * @returns 清理后的任务描述
 */
export function extractTaskDescription(content: string): string {
	let text = content;

	// 移除 Tasks emoji 优先级标记
	text = text.replace(/\s*(🔺|⏫|🔼|🔽|⏬)\s*/g, ' ');

	// 移除 Tasks emoji 日期属性 (emoji + 空格 + 日期)
	text = text.replace(/\s*(➕|🛫|⏳|📅|❌|✅)\s*\d{4}-\d{2}-\d{2}\s*/g, ' ');

	// 移除 Dataview [field:: value] 块
	text = text.replace(/\s*\[(priority|created|start|scheduled|due|cancelled|completion)::[^\]]+\]\s*/g, ' ');

	// 折叠多余空格并修剪首尾空格
	text = text.replace(/\s{2,}/g, ' ').trim();

	return text;
}

/**
 * 解析列表项中的任务
 */
export function parseTasksFromListItems(
	file: TFile,
	lines: string[],
	listItems: ListItemCache[],
	enabledFormats: string[],
	globalTaskFilter: string
): GanttTask[] {
	const tasks: GanttTask[] = [];
	for (const item of listItems) {
		const lineNumber = item.position.start.line;
		const line = lines[lineNumber];
		if (!line) continue;
		const taskMatch = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.*)/);
		if (!taskMatch) continue;
		const [, checkedStatus, taskContent] = taskMatch;
		const isCompleted = checkedStatus.toLowerCase() === 'x';
		if (globalTaskFilter) {
			const trimmedContent = taskContent.trim();
			if (!trimmedContent.startsWith(globalTaskFilter)) {
				continue;
			}
		}
		const contentWithoutFilter = globalTaskFilter
			? taskContent.replace(new RegExp(`^\s*${escapeRegExp(globalTaskFilter)}\s*`), '')
			: taskContent;
		const task: GanttTask = {
			filePath: file.path,
			fileName: file.basename,
			lineNumber: lineNumber + 1,
			content: contentWithoutFilter,
			description: extractTaskDescription(contentWithoutFilter),
			completed: isCompleted,
		};
		const hasTasksFormat = enabledFormats.includes('tasks') ? parseTasksFormat(contentWithoutFilter, task) : false;
		const hasDataviewFormat = enabledFormats.includes('dataview') ? parseDataviewFormat(contentWithoutFilter, task) : false;
		if (hasTasksFormat && hasDataviewFormat) {
			task.warning = '混用任务格式，请修改';
		} else if (!task.priority && !task.createdDate && !task.startDate &&
			!task.scheduledDate && !task.dueDate && !task.cancelledDate && !task.completionDate) {
			task.warning = '未规划任务时间，请设置';
		}
		tasks.push(task);
	}
	return tasks.sort((a, b) => a.lineNumber - b.lineNumber);
}

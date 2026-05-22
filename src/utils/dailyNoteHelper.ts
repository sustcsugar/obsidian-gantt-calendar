/**
 * Daily Note Helper
 *
 * 处理 Daily Note 的检测、创建和任务插入逻辑
 */

import { App, Notice, TFile, TFolder } from 'obsidian';
import type { GanttCalendarSettings } from '../settings';
import { i18n } from '../i18n/i18n';
import { formatDate } from '../dateUtils/dateUtilsIndex';
import { Logger } from './logger';
import type { DailyNoteIndex } from './dailyNoteSettingsBridge';
import { getDailyNote as getDailyNoteFromIndex, createDailyNote } from 'obsidian-daily-notes-interface';
import { showConfirmDialog } from '../modals/ConfirmModal';

/**
 * 搜索结果接口
 */
export interface DailyNoteSearchResult {
	file: TFile;
	relativePath: string; // 相对于指定根文件夹的路径
}

/**
 * 递归搜索指定文件夹及其子文件夹中的 Daily Note 文件
 *
 * @param app Obsidian App 实例
 * @param rootFolderPath 根文件夹路径
 * @param fileName 目标文件名（如 '2026-01-23.md'）
 * @returns 找到的文件信息，如果未找到则返回 null
 */
export function findDailyNoteRecursive(
	app: App,
	rootFolderPath: string,
	fileName: string
): DailyNoteSearchResult | null {
	const rootFolder = app.vault.getAbstractFileByPath(rootFolderPath);

	if (!rootFolder || !(rootFolder instanceof TFolder)) {
		return null;
	}

	// 使用深度优先搜索递归查找
	return searchFolderRecursive(rootFolder, fileName, rootFolderPath);
}

/**
 * 递归搜索文件夹
 */
function searchFolderRecursive(
	folder: TFolder,
	targetFileName: string,
	rootPath: string
): DailyNoteSearchResult | null {
	// 检查文件夹中的所有子文件
	for (const child of folder.children) {
		// 如果是目标文件，直接返回
		if (child instanceof TFile && child.name === targetFileName) {
			return {
				file: child,
				relativePath: child.path.substring(rootPath.length + 1)
			};
		}

		// 如果是子文件夹，递归搜索
		if (child instanceof TFolder) {
			const result = searchFolderRecursive(child, targetFileName, rootPath);
			if (result) {
				return result;
			}
		}
	}

	return null;
}

/**
 * 新任务数据接口
 */
export interface CreateTaskData {
	description: string;
	priority?: 'highest' | 'high' | 'medium' | 'low' | 'lowest';
	repeat?: string;
	createdDate: Date;
	startDate?: Date | null;
	scheduledDate?: Date | null;
	dueDate: Date;
	completionDate?: Date | null;
	cancelledDate?: Date | null;
	tags?: string[];
	datePrecision?: Record<string, 'day' | 'time'>;
}

/**
 * 在 Daily Note 中创建任务
 * 支持 Obsidian 核心日记插件、Periodic Notes 插件和手动配置
 *
 * @param app Obsidian App 实例
 * @param taskData 任务数据
 * @param settings 插件设置
 * @param dailyNoteIndex 日记索引缓存（Obsidian 模式时使用）
 */
export async function createTaskInDailyNote(
	app: App,
	taskData: CreateTaskData,
	settings: GanttCalendarSettings,
	dailyNoteIndex?: DailyNoteIndex
): Promise<void> {
	if (settings.followObsidianDailyNote && dailyNoteIndex) {
		// Obsidian 模式：使用 obsidian-daily-notes-interface
		const momentDate = window.moment();
		const dailyNotes = dailyNoteIndex.getIndex();
		let file = getDailyNoteFromIndex(momentDate, dailyNotes);

		if (!file) {
			// 弹出确认对话框
			const confirmed = await showConfirmDialog(
				app, 'Daily Note 不存在', '当天的 Daily Note 尚未创建，是否现在创建？',
				{ confirmText: '创建', cancelText: '取消' }
			);
			if (!confirmed) {
				new Notice(i18n.t('dailyNote.createCancelled'));
				return;
			}
			file = await createDailyNote(momentDate);
			dailyNoteIndex.invalidate();
		}

		if (file) {
			await insertTaskToFile(app, file, taskData, settings.newTaskHeading);
			new Notice(i18n.t('dailyNote.taskAdded'));
		}
		return;
	}

	// 手动模式
	const { dailyNotePath, dailyNoteNameFormat, newTaskHeading } = settings;

	// 修复嵌套文件夹格式 bug：提取纯文件名用于搜索
	const fullFormatResult = formatDate(new Date(), dailyNoteNameFormat);
	const fileName = fullFormatResult.split('/').pop()! + '.md';

	const searchResult = findDailyNoteRecursive(app, dailyNotePath, fileName);

	if (searchResult) {
		await insertTaskToFile(app, searchResult.file, taskData, newTaskHeading);
	} else {
		// 创建新文件时使用完整格式路径（支持嵌套文件夹）
		const filePath = `${dailyNotePath}/${fullFormatResult}.md`;
		await handleMissingDailyNote(app, filePath, taskData, settings);
	}
}

/**
 * 处理 Daily Note 不存在的情况
 */
async function handleMissingDailyNote(
	app: App,
	filePath: string,
	taskData: CreateTaskData,
	settings: GanttCalendarSettings
): Promise<void> {
	// 弹出确认对话框
	const confirmed = await showConfirmDialog(
		app, 'Daily Note 不存在', '当天的 Daily Note 尚未创建，是否现在创建？',
		{ confirmText: '创建', cancelText: '取消' }
	);

	if (!confirmed) {
		new Notice(i18n.t('dailyNote.createCancelled'));
		return;
	}

	try {
		await createDailyNoteFromTemplate(app, filePath, settings.dailyNoteTemplatePath);

		// 创建后插入任务
		const abstractFile = app.vault.getAbstractFileByPath(filePath);
		if (abstractFile instanceof TFile) {
			await insertTaskToFile(app, abstractFile, taskData, settings.newTaskHeading);
			new Notice(i18n.t('dailyNote.createdAndAdded'));
		}
	} catch (error) {
		Logger.error('DailyNoteHelper', 'Error creating daily note:', error);
		new Notice(i18n.t('dailyNote.createFailed', { error: (error as Error).message }));
	}
}

/**
 * 使用模板文件创建 Daily Note
 */
async function createDailyNoteFromTemplate(
	app: App,
	filePath: string,
	templatePath: string
): Promise<void> {
	// 确保文件夹存在
	const folderPath = filePath.split('/').slice(0, -1).join('/');
	if (folderPath) {
		const folder = app.vault.getAbstractFileByPath(folderPath);
		if (!folder) {
			await app.vault.createFolder(folderPath);
		}
	}

	let content = '';

	if (templatePath) {
		const templateFile = app.vault.getAbstractFileByPath(templatePath);
		if (templateFile instanceof TFile) {
			content = await app.vault.read(templateFile);
			content = replaceTemplateVariables(content, filePath);
		} else {
			throw new Error(`模板文件未找到: ${templatePath}`);
		}
	}

	await app.vault.create(filePath, content);
}

/**
 * 替换模板变量
 * 支持 {{date}}、{{time}}、{{title}}、{{date:FORMAT}}、{{yesterday}}、{{tomorrow}}
 */
function replaceTemplateVariables(content: string, filePath: string): string {
	const moment = window.moment;
	const date = moment();
	const filename = filePath.split('/').pop()!.replace(/\.md$/, '');

	// 先处理带格式和偏移的复杂模式 {{date:FORMAT}}、{{date+1d:FORMAT}}
	content = content.replace(
		/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi,
		(_, _key, _calc, delta, unit, fmt) => {
			const current = date.clone();
			if (delta && unit) {
				current.add(parseInt(delta, 10), unit);
			}
			if (fmt) {
				return current.format(fmt.substring(1).trim());
			}
			return current.format('YYYY-MM-DD');
		}
	);

	content = content.replace(/{{\s*date\s*}}/gi, filename);
	content = content.replace(/{{\s*time\s*}}/gi, moment().format('HH:mm'));
	content = content.replace(/{{\s*title\s*}}/gi, filename);
	content = content.replace(/{{\s*yesterday\s*}}/gi, date.clone().subtract(1, 'day').format('YYYY-MM-DD'));
	content = content.replace(/{{\s*tomorrow\s*}}/gi, date.clone().add(1, 'day').format('YYYY-MM-DD'));

	return content;
}

/**
 * 在文件中插入任务
 */
async function insertTaskToFile(
	app: App,
	file: TFile,
	taskData: CreateTaskData,
	heading?: string
): Promise<void> {
	const content = await app.vault.read(file);
	const lines = content.split('\n');

	// 序列化任务为文本
	const taskLine = serializeNewTask(taskData, app);

	if (heading) {
		// 在指定标题下插入
		const headingIndex = findHeadingIndex(lines, heading);
		if (headingIndex !== -1) {
			// 找到标题后的最后一个内容行
			const insertIndex = findLastContentLineIndex(lines, headingIndex);
			lines.splice(insertIndex + 1, 0, taskLine);
		} else {
			// 标题不存在，添加到文件末尾并创建标题
			lines.push('', heading.startsWith('#') ? heading : `## ${heading}`, '', taskLine);
		}
	} else {
		// 添加到文件末尾
		if (lines[lines.length - 1].trim()) {
			lines.push('');  // 添加空行
		}
		lines.push(taskLine);
	}

	await app.vault.modify(file, lines.join('\n'));
}

/**
 * 序列化新任务为文本行
 */
function serializeNewTask(taskData: CreateTaskData, app: App): string {
	const plugin = (app as any).plugins.plugins['gantt-calendar'];
	const globalFilter = plugin?.settings?.globalTaskFilter || '';
	const enabledFormats = plugin?.settings?.enabledTaskFormats || ['tasks'];
	const format = enabledFormats.includes('dataview') ? 'dataview' : 'tasks';

	const parts: string[] = [];

	// 复选框
	parts.push('[ ]');

	// 全局过滤器
	if (globalFilter) {
		parts.push(globalFilter.trim());
	}

	// 标签
	if (taskData.tags && taskData.tags.length > 0) {
		parts.push(taskData.tags.map(t => `#${t}`).join(' '));
	}

	// 描述
	parts.push(taskData.description);

	// 优先级
	if (taskData.priority) {
		if (format === 'tasks') {
			const priorityEmoji = getPriorityEmoji(taskData.priority);
			if (priorityEmoji) parts.push(priorityEmoji);
		} else {
			parts.push(`[priority:: ${taskData.priority}]`);
		}
	}

	// 周期任务
	if (taskData.repeat) {
		if (format === 'tasks') {
			parts.push(`🔁 ${taskData.repeat}`);
		} else {
			parts.push(`[repeat:: ${taskData.repeat}]`);
		}
	}

	// 创建日期
	const createdPrecision = taskData.datePrecision?.['createdDate'];
		const createdStr = formatDate(taskData.createdDate, createdPrecision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
	if (format === 'tasks') {
		parts.push(`➕ ${createdStr}`);
	} else {
		parts.push(`[created:: ${createdStr}]`);
	}

	// 开始日期
	if (taskData.startDate) {
		const startPrecision = taskData.datePrecision?.['startDate'];
		const startStr = formatDate(taskData.startDate, startPrecision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
		if (format === 'tasks') {
			parts.push(`🛫 ${startStr}`);
		} else {
			parts.push(`[start:: ${startStr}]`);
		}
	}

	// 计划日期
	if (taskData.scheduledDate) {
		const scheduledPrecision = taskData.datePrecision?.['scheduledDate'];
		const scheduledStr = formatDate(taskData.scheduledDate, scheduledPrecision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
		if (format === 'tasks') {
			parts.push(`⏳ ${scheduledStr}`);
		} else {
			parts.push(`[scheduled:: ${scheduledStr}]`);
		}
	}

	// 截止日期
	const duePrecision = taskData.datePrecision?.['dueDate'];
		const dueStr = formatDate(taskData.dueDate, duePrecision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
	if (format === 'tasks') {
		parts.push(`📅 ${dueStr}`);
	} else {
		parts.push(`[due:: ${dueStr}]`);
	}

	// 完成日期
	if (taskData.completionDate) {
		const completionPrecision = taskData.datePrecision?.['completionDate'];
		const completionStr = formatDate(taskData.completionDate, completionPrecision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
		if (format === 'tasks') {
			parts.push(`✅ ${completionStr}`);
		} else {
			parts.push(`[completed:: ${completionStr}]`);
		}
	}

	// 取消日期
	if (taskData.cancelledDate) {
		const cancelledPrecision = taskData.datePrecision?.['cancelledDate'];
		const cancelledStr = formatDate(taskData.cancelledDate, cancelledPrecision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
		if (format === 'tasks') {
			parts.push(`❌ ${cancelledStr}`);
		} else {
			parts.push(`[cancelled:: ${cancelledStr}]`);
		}
	}

	return `- ${parts.join(' ')}`;
}

/**
 * 获取优先级 emoji
 */
function getPriorityEmoji(priority: string): string {
	const map: Record<string, string> = {
		highest: '🔺',
		high: '⏫',
		medium: '🔼',
		low: '🔽',
		lowest: '⏬',
		normal: '',
	};
	return map[priority] || '';
}

/**
 * 查找标题行索引
 */
function findHeadingIndex(lines: string[], heading: string): number {
	// 移除 ## 前缀（如果用户输入了）
	const cleanHeading = heading.replace(/^#+\s*/, '').trim();
	const headingRegex = new RegExp(`^#{1,6}\\s+${cleanHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
	return lines.findIndex(line => headingRegex.test(line));
}

/**
 * 查找标题后的最后一个内容行索引
 */
function findLastContentLineIndex(lines: string[], startIdx: number): number {
	let lastContentIdx = startIdx;

	for (let i = startIdx + 1; i < lines.length; i++) {
		const line = lines[i];

		// 遇到同级或更高级标题则停止
		if (/^#{1,2}\s/.test(line)) {
			break;
		}

		// 记录最后一个非空行
		if (line.trim()) {
			lastContentIdx = i;
		}
	}

	return lastContentIdx;
}

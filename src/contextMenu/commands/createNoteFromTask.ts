import { App, Notice, normalizePath } from 'obsidian';
import type { GCTask } from '../../types';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { updateTaskProperties } from '../../tasks/taskUpdater';
import { Logger } from '../../utils/logger';

// ==================== 类型定义 ====================

/**
 * 笔记创建选项
 */
export interface CreateNoteOptions {
	/** Wiki 链接内容（替换任务描述） */
	wikiLinkContent: string;
	/** 是否使用别名显示文本（[[fileName|displayName]]） */
	useAliasDisplay?: boolean;
	/** 显示文本（仅当 useAliasDisplay=true 时使用） */
	displayText?: string;
}

/**
 * 笔记模板数据
 */
export interface NoteTemplateData {
	/** 文件名/笔记标题 */
	title: string;
	/** 原任务描述（用于别名显示） */
	originalDescription?: string;
	/** 任务对象 */
	task: GCTask;
	/** Markdown 链接 */
	markdownLinks?: Array<{ text: string; url: string }>;
	/** 裸 URL */
	rawUrls?: string[];
}

// ==================== 核心函数 ====================

/**
 * 检查任务中是否已存在双链
 * @returns 如果存在双链且文件存在，返回文件路径；否则返回 null
 */
export function checkExistingWikiLink(task: GCTask, app: App): string | null {
	const raw = task.content;
	const wikiLinkMatch = raw.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
	if (wikiLinkMatch) {
		const linkTarget = wikiLinkMatch[1];
		const dest = app.metadataCache.getFirstLinkpathDest(linkTarget, task.filePath);
		if (dest) {
			return linkTarget;
		}
	}
	return null;
}

/**
 * 打开已存在的笔记（不修改任务文本）
 */
export async function openExistingNote(
	app: App,
	task: GCTask,
	linkTarget: string
): Promise<void> {
	const dest = app.metadataCache.getFirstLinkpathDest(linkTarget, task.filePath);
	if (dest) {
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(dest);
		new Notice('已存在任务笔记');
	}
}

/**
 * 收集任务中的超链接
 * @returns [markdownLinks, rawUrls]
 */
function collectTaskLinks(raw: string): [Array<{ text: string; url: string }>, string[]] {
	const markdownLinks: Array<{ text: string; url: string }> = [];
	const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
	let m: RegExpExecArray | null;
	while ((m = linkRegex.exec(raw)) !== null) {
		markdownLinks.push({ text: m[1], url: m[2] });
	}

	const rawUrls: string[] = [];
	const urlRegex = /(https?:\/\/[^\s)]+)/g;
	let u: RegExpExecArray | null;
	while ((u = urlRegex.exec(raw)) !== null) {
		// 避免与 markdownLinks 重复收集
		if (!markdownLinks.some(l => l.url === u![1])) {
			rawUrls.push(u[1]);
		}
	}

	return [markdownLinks, rawUrls];
}

/**
 * 生成笔记内容（统一模板）
 * 支持未来扩展：可通过插件设置自定义模板
 */
export function generateNoteContent(data: NoteTemplateData): string {
	const { title, task, markdownLinks = [], rawUrls = [] } = data;
	const lines: string[] = [];

	lines.push(`# ${title}`);
	lines.push('');
	lines.push('## 任务信息');
	lines.push('');

	if (task.priority) {
		lines.push(`- **优先级**: ${task.priority}`);
	}

	if (task.tags && task.tags.length > 0) {
		lines.push(`- **标签**: ${task.tags.map(t => `#${t}`).join(' ')}`);
	}

	if (task.createdDate) {
		lines.push(`- **创建日期**: ${formatDate(task.createdDate, 'yyyy-MM-dd')}`);
	}

	if (task.startDate) {
		lines.push(`- **开始日期**: ${formatDate(task.startDate, 'yyyy-MM-dd')}`);
	}

	if (task.scheduledDate) {
		lines.push(`- **计划日期**: ${formatDate(task.scheduledDate, 'yyyy-MM-dd')}`);
	}

	if (task.dueDate) {
		lines.push(`- **截止日期**: ${formatDate(task.dueDate, 'yyyy-MM-dd')}`);
	}

	if (task.completionDate) {
		lines.push(`- **完成日期**: ${formatDate(task.completionDate, 'yyyy-MM-dd')}`);
	}

	if (task.cancelledDate) {
		lines.push(`- **取消日期**: ${formatDate(task.cancelledDate, 'yyyy-MM-dd')}`);
	}

	// 如果有原任务描述（别名笔记的情况）
	if (data.originalDescription) {
		lines.push(`- **原任务**: ${data.originalDescription}`);
	}

	// 参考链接
	if (markdownLinks.length || rawUrls.length) {
		lines.push('');
		lines.push('## Reference');
		lines.push('');
		for (const l of markdownLinks) {
			lines.push(`- [${l.text}](${l.url})`);
		}
		for (const url of rawUrls) {
			lines.push(`- ${url}`);
		}
	}

	lines.push('');
	lines.push(`- **来源**: [[${task.fileName}#^line-${task.lineNumber}|${task.fileName}:${task.lineNumber}]]`);
	lines.push('');
	lines.push('## 笔记内容');
	lines.push('');

	return lines.join('\n');
}

/**
 * 创建任务笔记的核心函数
 * @param app Obsidian App 实例
 * @param task 任务对象
 * @param defaultPath 默认笔记路径
 * @param fileName 文件名
 * @param options 创建选项
 * @param enabledFormats 启用的任务格式
 */
export async function createNoteFromTaskCore(
	app: App,
	task: GCTask,
	defaultPath: string,
	fileName: string,
	options: CreateNoteOptions,
	enabledFormats: string[] = ['tasks']
): Promise<void> {
	try {
		// 1) 检查文件名是否有效
		if (!fileName) {
			new Notice('文件名为空，无法创建文件');
			return;
		}

		// 2) 收集超链接
		const [markdownLinks, rawUrls] = collectTaskLinks(task.content);

		// 3) 确保目标文件夹存在
		await ensureFolderExists(app, defaultPath);

		// 4) 检查整个 vault 中是否存在同名文件
		const existingFileInVault = app.metadataCache.getFirstLinkpathDest(fileName, task.filePath);
		if (existingFileInVault) {
			new Notice(`已存在同名笔记: ${fileName}.md`);
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(existingFileInVault);
			// 直接将任务改为双链，方便后续跳转
			await updateTaskProperties(app, task, { content: options.wikiLinkContent }, enabledFormats);
			return;
		}

		// 5) 构建文件路径并检查指定目录下是否已存在
		const filePath = normalizePath(`${defaultPath}/${fileName}.md`);
		const existingFile = app.vault.getAbstractFileByPath(filePath);
		if (existingFile) {
			new Notice(`指定目录下已存在文件: ${fileName}.md`);
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(existingFile as any);
			// 仍将任务内容改为双链，方便后续跳转
			await updateTaskProperties(app, task, { content: options.wikiLinkContent }, enabledFormats);
			return;
		}

		// 6) 生成笔记内容（使用统一模板）
		const templateData: NoteTemplateData = {
			title: fileName,
			originalDescription: options.displayText,
			task,
			markdownLinks,
			rawUrls,
		};
		const noteContent = generateNoteContent(templateData);

		// 7) 创建文件
		const file = await app.vault.create(filePath, noteContent);

		// 8) 打开新创建的文件
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(file);

		new Notice(`已创建笔记: ${fileName}.md`);

		// 9) 更新源任务行为双链，使用 updateTaskProperties 保留 tags 等元数据
		await updateTaskProperties(app, task, { content: options.wikiLinkContent }, enabledFormats);
	} catch (error) {
		Logger.error('createNoteFromTask', 'Failed to create note from task:', error);
		new Notice('创建笔记失败');
	}
}

/**
 * 创建任务同名笔记
 * 以任务描述为文件名，创建笔记，存放在默认路径
 */
export async function createNoteFromTask(
	app: App,
	task: GCTask,
	defaultPath: string,
	enabledFormats: string[] = ['tasks']
): Promise<void> {
	// 1) 先检查任务中是否已存在双链，如果有则直接打开
	const existingLink = checkExistingWikiLink(task, app);
	if (existingLink) {
		await openExistingNote(app, task, existingLink);
		return;
	}

	// 2) 清理任务描述，生成文件名
	const baseDesc = removeLinksFromDescription(cleanTaskDescriptionFromTask(task));
	const fileName = sanitizeFileName(baseDesc);

	// 3) wiki 链接内容（不带别名）
	const wikiLinkContent = `[[${fileName}]]`;

	await createNoteFromTaskCore(app, task, defaultPath, fileName, { wikiLinkContent }, enabledFormats);
}

// ==================== 工具函数 ====================

/**
 * 使用已解析的 task.description 清理任务描述（用于文件名生成）
 */
export function cleanTaskDescriptionFromTask(task: GCTask): string {
	let text = task.description || '';
	// 移除 wiki 链接语法，仅保留显示文本
	text = text.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, ' $1 ');
	// 折叠多余空格
	text = text.replace(/\s{2,}/g, ' ').trim();
	return text;
}

/**
 * 从描述中移除 markdown 链接和裸 URL
 */
function removeLinksFromDescription(text: string): string {
	return text
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, ' $1 ') // 去掉 markdown 链接，仅保留文本
		.replace(/(https?:\/\/[^\s)]+)/g, ' ') // 去掉裸 URL
		.replace(/\s{2,}/g, ' ').trim();
}

/**
 * 清理文件名中的非法字符
 */
export function sanitizeFileName(name: string): string {
	// 移除或替换文件名中的非法字符
	return name
		.replace(/[\\/:*?"<>|]/g, '-') // 替换非法字符为连字符
		.replace(/\s+/g, ' ') // 折叠多个空格
		.trim()
		.substring(0, 200); // 限制文件名长度
}

/**
 * 确保文件夹存在
 */
export async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const normalizedPath = normalizePath(folderPath);
	const folder = app.vault.getAbstractFileByPath(normalizedPath);

	if (!folder) {
		await app.vault.createFolder(normalizedPath);
	}
}

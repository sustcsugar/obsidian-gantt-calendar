/**
 * Daily Note Helper
 *
 * 处理 Daily Note 的检测、创建和任务插入逻辑
 * 支持 Templater 插件集成
 */

import { App, Notice, Modal, TFile, TFolder } from 'obsidian';
import type { GanttCalendarSettings } from '../settings';
import { formatDate } from '../dateUtils/dateUtilsIndex';

/**
 * 新任务数据接口
 */
export interface CreateTaskData {
	description: string;
	priority: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal';
	createdDate: Date;
	dueDate: Date;
	tags: string[];
}

/**
 * 在 Daily Note 中创建任务
 *
 * @param app Obsidian App 实例
 * @param taskData 任务数据
 * @param settings 插件设置
 */
export async function createTaskInDailyNote(
	app: App,
	taskData: CreateTaskData,
	settings: GanttCalendarSettings
): Promise<void> {
	const { dailyNotePath, dailyNoteNameFormat, newTaskHeading } = settings;

	// 1. 构建 Daily Note 路径
	const fileName = formatDate(new Date(), dailyNoteNameFormat) + '.md';
	const filePath = `${dailyNotePath}/${fileName}`;

	// 2. 检查文件是否存在
	const file = app.vault.getAbstractFileByPath(filePath);

	if (!file || !(file instanceof TFile)) {
		// Daily Note 不存在，询问用户是否创建
		await handleMissingDailyNote(app, filePath, taskData, settings);
	} else {
		// Daily Note 存在，直接插入任务
		await insertTaskToFile(app, file, taskData, newTaskHeading);
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
	const { enableTemplaterForDailyNote, templaterTemplatePath } = settings;

	// 弹出确认对话框
	const confirmed = await new Promise<boolean>((resolve) => {
		new ConfirmCreateModal(app, async (confirmed) => {
			resolve(confirmed);
		}).open();
	});

	if (!confirmed) {
		new Notice('已取消创建任务');
		return;
	}

	// 检测 Templater 是否安装
	const templater = (app as any).plugins.plugins['templater'];
	const hasTemplater = templater?.templater && enableTemplaterForDailyNote;

	try {
		if (hasTemplater && templaterTemplatePath) {
			// 使用 Templater 创建
			await createWithTemplater(app, filePath, templaterTemplatePath);
		} else {
			// 使用简单模板创建
			await createWithSimpleTemplate(app, filePath);
		}

		// 创建后插入任务
		const file = app.vault.getAbstractFileByPath(filePath) as TFile;
		if (file) {
			await insertTaskToFile(app, file, taskData, settings.newTaskHeading);
			new Notice('已创建 Daily Note 并添加任务');
		}
	} catch (error) {
		console.error('[DailyNoteHelper] Error creating daily note:', error);
		new Notice('创建 Daily Note 失败: ' + (error as Error).message);
	}
}

/**
 * 使用 Templater 创建 Daily Note
 */
async function createWithTemplater(
	app: App,
	filePath: string,
	templatePath: string
): Promise<void> {
	const templater = (app as any).plugins.plugins['templater'];
	if (!templater?.templater) {
		throw new Error('Templater 插件未找到');
	}

	const { tp } = templater.templater;
	const templateFile = app.vault.getAbstractFileByPath(templatePath);

	if (!templateFile || !(templateFile instanceof TFile)) {
		throw new Error(`模板文件未找到: ${templatePath}`);
	}

	// 获取目标文件夹
	const folderPath = filePath.split('/').slice(0, -1).join('/');
	const folder = app.vault.getAbstractFileByPath(folderPath);

	// 创建文件夹（如果不存在）
	if (!folder) {
		await app.vault.createFolder(folderPath);
	}

	// 使用 Templater 创建笔记
	await tp.file.create_new_note_from_template(templateFile, folder as TFolder);
}

/**
 * 使用简单模板创建 Daily Note
 */
async function createWithSimpleTemplate(app: App, filePath: string): Promise<void> {
	const today = formatDate(new Date(), 'yyyy-MM-dd');
	const content = `# ${today}\n\n`;

	// 确保文件夹存在
	const folderPath = filePath.split('/').slice(0, -1).join('/');
	const folder = app.vault.getAbstractFileByPath(folderPath);

	if (!folder) {
		await app.vault.createFolder(folderPath);
	}

	await app.vault.create(filePath, content);
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
	const plugin = (app as any).plugins.plugins['obsidian-gantt-calendar'];
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
	if (taskData.tags.length > 0) {
		parts.push(taskData.tags.map(t => `#${t}`).join(' '));
	}

	// 描述
	parts.push(taskData.description);

	// 优先级
	if (format === 'tasks' && taskData.priority !== 'normal') {
		const priorityEmoji = getPriorityEmoji(taskData.priority);
		if (priorityEmoji) parts.push(priorityEmoji);
	}

	// 创建日期
	const createdStr = formatDate(taskData.createdDate, 'yyyy-MM-dd');
	if (format === 'tasks') {
		parts.push(`➕ ${createdStr}`);
	} else {
		parts.push(`[created:: ${createdStr}]`);
	}

	// 截止日期
	const dueStr = formatDate(taskData.dueDate, 'yyyy-MM-dd');
	if (format === 'tasks') {
		parts.push(`📅 ${dueStr}`);
	} else {
		parts.push(`[due:: ${dueStr}]`);
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

/**
 * 确认创建弹窗
 */
class ConfirmCreateModal extends Modal {
	private callback: (confirmed: boolean) => void;

	constructor(app: App, callback: (confirmed: boolean) => void) {
		super(app);
		this.callback = callback;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Daily Note 不存在' });

		const desc = contentEl.createEl('p', {
			text: '当天的 Daily Note 尚未创建，是否现在创建？'
		});

		const buttonContainer = contentEl.createDiv({
			cls: 'modal-button-container'
		});

		const cancelButton = buttonContainer.createEl('button', {
			text: '取消',
			cls: 'mod-cancel'
		});
		cancelButton.onclick = () => {
			this.callback(false);
			this.close();
		};

		const confirmButton = buttonContainer.createEl('button', {
			text: '创建',
			cls: 'mod-confirmed'
		});
		confirmButton.onclick = () => {
			this.callback(true);
			this.close();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

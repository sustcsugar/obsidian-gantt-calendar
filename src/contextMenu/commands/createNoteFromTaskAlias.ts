import { App, Modal, Setting } from 'obsidian';
import type { GCTask } from '../../types';
import { i18n } from '../../i18n/i18n';
import {
	createNoteFromTaskCore,
	checkExistingWikiLink,
	openExistingNote,
	cleanTaskDescriptionFromTask,
	sanitizeFileName,
	type CreateNoteOptions,
} from './createNoteFromTask';
import { setCssProps } from '../../utils/bem';

/**
 * 创建任务别名笔记
 * 先检查是否已存在双链，再弹窗输入别名，创建笔记
 */
export async function createNoteFromTaskAlias(
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

	// 2) 弹窗输入别名
	const alias = await promptForAlias(app, task);
	if (!alias) return;

	// 清理原任务描述（用于显示文本）
	const baseDesc = cleanTaskDescriptionFromTask(task);
	const fileName = sanitizeFileName(alias);

	// wiki 链接内容（带别名的显示文本）
	const wikiLinkContent = `[[${fileName}|${baseDesc}]]`;

	// 创建选项
	const options: CreateNoteOptions = {
		wikiLinkContent,
		displayText: baseDesc,
	};

	await createNoteFromTaskCore(app, task, defaultPath, fileName, options, enabledFormats);
}

// ==================== 弹窗组件 ====================

function promptForAlias(app: App, task: GCTask): Promise<string | null> {
	return new Promise((resolve) => {
		const modal = new AliasInputModal(app, resolve, task);
		modal.open();
	});
}

class AliasInputModal extends Modal {
	private onSubmit: (alias: string | null) => void;
	private task: GCTask;

	constructor(app: App, onSubmit: (alias: string | null) => void, task: GCTask) {
		super(app);
		this.onSubmit = onSubmit;
		this.task = task;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: i18n.t('contextMenu.commands.enterNoteName') });

		const input = contentEl.createEl('input', { type: 'text', value: '' });
		input.placeholder = '请输入笔记名称(任务描述为笔记别名)';
		setCssProps(input, { width: '100%' });
		input.focus();

		new Setting(contentEl)
			.addButton(btn => btn.setButtonText(i18n.t('common.ok')).setCta().onClick(() => {
				const val = input.value.trim();
				this.close();
				this.onSubmit(val || null);
			}))
			.addButton(btn => btn.setButtonText(i18n.t('common.cancel')).onClick(() => {
				this.close();
				this.onSubmit(null);
			}));

		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				const val = input.value.trim();
				this.close();
				this.onSubmit(val || null);
			}
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

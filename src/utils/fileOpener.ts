/**
 * @fileoverview 文件打开工具 - 智能打开 Obsidian 文件
 *
 * 提供在 Obsidian 中打开文件的功能，具有以下特性：
 * - 避免重复打开同一文件的多个标签页
 * - 如果文件已在其他标签页打开，则聚焦该标签页
 * - 支持跳转到指定行号（用于定位任务）
 *
 * @module utils/fileOpener
 */

import { App, MarkdownView, TFile } from 'obsidian';

/**
 * Open file in existing leaf if already open, otherwise create a new tab
 */
export async function openFileInExistingLeaf(app: App, filePath: string, lineNumber?: number) {
	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return;

	const { workspace } = app;

	// Find an already open markdown leaf for the same file
	const existingLeaf = workspace.getLeavesOfType('markdown').find((leaf) => {
		const view = leaf.view as MarkdownView;
		return view?.file?.path === file.path;
	});

	let leaf = existingLeaf;

	if (!leaf) {
		// Open in a new tab if not already open
		leaf = workspace.getLeaf('tab');
		await leaf.openFile(file);
	} else {
		// Focus the existing tab
		workspace.setActiveLeaf(leaf, { focus: true });
	}

	// Ensure the file is loaded in the leaf (safety)
	const view = leaf.view as MarkdownView;
	if (!view?.file || view.file.path !== file.path) {
		await leaf.openFile(file);
	}

	// Jump to the target line if provided
	if (lineNumber && lineNumber > 0) {
		const editor = view?.editor;
		if (editor) {
			editor.setCursor({ line: lineNumber - 1, ch: 0 });
		}
	}

	void workspace.revealLeaf(leaf);
}

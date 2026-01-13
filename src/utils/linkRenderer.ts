import { Notice, type App } from 'obsidian';
import { RegularExpressions } from './RegularExpressions';
import { openFileInExistingLeaf } from './fileOpener';

/**
 * 链接渲染工具类
 * 提供任务描述中链接的统一渲染逻辑
 */
export class LinkRenderer {
	/**
	 * 渲染任务描述为富文本（包含可点击的链接）
	 * 支持：
	 * - Obsidian 双向链接：[[note]] 或 [[note|alias]]
	 * - Markdown 链接：[text](url)
	 * - 网址链接：http://example.com 或 https://example.com
	 *
	 * @param container - 容器元素
	 * @param text - 要渲染的文本
	 * @param app - Obsidian App 实例，用于打开文件链接
	 */
	static renderTaskDescriptionWithLinks(container: HTMLElement, text: string, app: App): void {
		// 从统一正则入口获取链接正则表达式
		const obsidianLinkRegex = RegularExpressions.Links.obsidianLinkRegex;
		const markdownLinkRegex = RegularExpressions.Links.markdownLinkRegex;
		const urlRegex = RegularExpressions.Links.urlLinkRegex;

		// 分割文本并处理链接
		let lastIndex = 0;
		const matches: Array<{ type: 'obsidian' | 'markdown' | 'url'; start: number; end: number; groups: RegExpExecArray }> = [];

		// 收集所有匹配
		let match;
		const textLower = text;

		// 收集 Obsidian 链接
		while ((match = obsidianLinkRegex.exec(textLower)) !== null) {
			matches.push({ type: 'obsidian', start: match.index, end: match.index + match[0].length, groups: match });
		}

		// 收集 Markdown 链接
		while ((match = markdownLinkRegex.exec(textLower)) !== null) {
			matches.push({ type: 'markdown', start: match.index, end: match.index + match[0].length, groups: match });
		}

		// 收集网址链接
		while ((match = urlRegex.exec(textLower)) !== null) {
			matches.push({ type: 'url', start: match.index, end: match.index + match[0].length, groups: match });
		}

		// 按位置排序并去重重叠
		matches.sort((a, b) => a.start - b.start);
		const uniqueMatches = [];
		let lastEnd = 0;
		for (const m of matches) {
			if (m.start >= lastEnd) {
				uniqueMatches.push(m);
				lastEnd = m.end;
			}
		}

		// 渲染文本和链接
		lastIndex = 0;
		for (const m of uniqueMatches) {
			// 添加前面的普通文本
			if (m.start > lastIndex) {
				container.appendText(text.substring(lastIndex, m.start));
			}

			// 添加链接
			if (m.type === 'obsidian') {
				const notePath = m.groups[1]; // [[note]] 中的 note
				const displayText = m.groups[2] || notePath; // 优先使用别名
				const link = container.createEl('a', { text: displayText, cls: 'gc-link gc-link--obsidian' });
				link.setAttr('data-href', notePath);
				link.setAttr('title', `打开：${notePath}`);
				link.href = 'javascript:void(0)';
				link.addEventListener('click', async (e) => {
					e.preventDefault();
					e.stopPropagation();
					const file = app.metadataCache.getFirstLinkpathDest(notePath, '');
					if (file) {
						await openFileInExistingLeaf(app, file.path, 0);
					} else {
						new Notice(`文件未找到：${notePath}`);
					}
				});
			} else if (m.type === 'markdown') {
				const displayText = m.groups[1]; // [text]
				const url = m.groups[2]; // (url)
				const link = container.createEl('a', { text: displayText, cls: 'gc-link gc-link--markdown' });
				link.href = url;
				link.setAttr('target', '_blank');
				link.setAttr('rel', 'noopener noreferrer');
				link.setAttr('title', url);
				link.addEventListener('click', (e) => {
					e.stopPropagation();
				});
			} else if (m.type === 'url') {
				const url = m.groups[1]; // 完整URL
				const link = container.createEl('a', { text: url, cls: 'gc-link gc-link--url' });
				link.href = url;
				link.setAttr('target', '_blank');
				link.setAttr('rel', 'noopener noreferrer');
				link.setAttr('title', url);
				link.addEventListener('click', (e) => {
					e.stopPropagation();
				});
			}

			lastIndex = m.end;
		}

		// 添加剩余的普通文本
		if (lastIndex < text.length) {
			container.appendText(text.substring(lastIndex));
		}
	}
}

import { App, Modal } from 'obsidian';
import type { SyncResult } from '../data-layer/feishu-sync/FeishuTaskSync';
import { SyncResultModalClasses } from '../utils/bem';

/**
 * 同步结果弹窗
 *
 * 展示同步操作的详细结果，包括统计摘要和每个变更任务的具体信息。
 */
export class SyncResultModal extends Modal {
	private result: SyncResult;
	private titleText: string;

	constructor(app: App, title: string, result: SyncResult) {
		super(app);
		this.titleText = title;
		this.result = result;
	}

	onOpen() {
		this.setTitle(this.titleText);
		const { contentEl } = this;
		contentEl.empty();

		this.renderSummary(contentEl);
		this.renderDetailList(contentEl);
		this.renderFooter(contentEl);
	}

	onClose() {
		this.contentEl.empty();
	}

	private renderSummary(container: HTMLElement) {
		const summaryEl = container.createDiv(SyncResultModalClasses.elements.summary);

		const stats = [
			{ label: '推送', count: this.result.pushed, hasData: this.result.pushed > 0 },
			{ label: '拉取', count: this.result.pulled, hasData: this.result.pulled > 0 },
			{ label: '冲突', count: this.result.conflicted, hasData: this.result.conflicted > 0 },
			{ label: '跳过', count: this.result.skipped, hasData: this.result.skipped > 0 },
		];

		const activeStats = stats.filter(s => s.hasData);
		if (activeStats.length === 0) {
			summaryEl.textContent = '无变更';
			summaryEl.style.color = 'var(--text-muted)';
		} else {
			for (const stat of activeStats) {
				const item = summaryEl.createSpan(SyncResultModalClasses.elements.summaryItem);
				item.textContent = `${stat.label} ${stat.count} 个`;
			}
		}
	}

	private renderDetailList(container: HTMLElement) {
		if (this.result.details.length === 0) return;

		const listEl = container.createDiv(SyncResultModalClasses.elements.detailList);

		for (const detail of this.result.details) {
			const item = listEl.createDiv(SyncResultModalClasses.elements.detailItem);
			item.addClass(detail.success ? SyncResultModalClasses.modifiers.success : SyncResultModalClasses.modifiers.failed);

			const isPush = detail.type.startsWith('push');
			if (isPush) {
				item.addClass(SyncResultModalClasses.modifiers.push);
			} else {
				item.addClass(SyncResultModalClasses.modifiers.pull);
			}

			// icon
			const icon = item.createSpan(SyncResultModalClasses.elements.detailIcon);
			icon.textContent = detail.success ? '✅' : '❌';

			// label badge
			const labelEl = item.createSpan(SyncResultModalClasses.elements.detailLabel);
			labelEl.textContent = detail.label;

			// task description
			const descEl = item.createSpan(SyncResultModalClasses.elements.detailDesc);
			descEl.textContent = detail.taskDescription;

			// error message
			if (detail.error) {
				const errorEl = item.createDiv(SyncResultModalClasses.elements.detailError);
				errorEl.textContent = detail.error;
			}
		}
	}

	private renderFooter(container: HTMLElement) {
		const footer = container.createDiv(SyncResultModalClasses.elements.footer);

		const confirmBtn = footer.createEl('button', { text: '确定' });
		confirmBtn.style.borderRadius = '9999px';
		confirmBtn.style.padding = '8px 24px';
		confirmBtn.style.background = 'var(--interactive-accent)';
		confirmBtn.style.color = 'var(--text-on-accent)';
		confirmBtn.style.border = 'none';
		confirmBtn.style.cursor = 'pointer';
		confirmBtn.style.fontSize = 'var(--font-ui-small)';
		confirmBtn.addEventListener('click', () => this.close());
	}
}

export function showSyncResultModal(app: App, title: string, result: SyncResult): void {
	new SyncResultModal(app, title, result).open();
}

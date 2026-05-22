import { App, Modal } from 'obsidian';
import { i18n } from '../i18n/i18n';

export interface ConfirmDialogOptions {
	confirmText?: string;
	cancelText?: string;
	isDestructive?: boolean;
}

export class ConfirmModal extends Modal {
	private resolve: (value: boolean) => void;
	private settled = false;
	private titleText: string;
	private messageText: string;
	private options: ConfirmDialogOptions;

	constructor(
		app: App,
		title: string,
		message: string,
		resolve: (value: boolean) => void,
		options?: ConfirmDialogOptions
	) {
		super(app);
		this.titleText = title;
		this.messageText = message;
		this.resolve = resolve;
		this.options = options ?? {};
	}

	onOpen() {
		this.setTitle(this.titleText);
		const { contentEl } = this;
		contentEl.empty();

		// 消息段落
		const msgEl = contentEl.createEl('p', {
			text: this.messageText,
		});
		msgEl.style.whiteSpace = 'pre-line';
		msgEl.style.lineHeight = '1.47';
		msgEl.style.fontSize = 'var(--font-ui-medium)';
		msgEl.style.color = 'var(--text-normal)';
		msgEl.style.margin = '0';

		// 按钮容器
		const btnContainer = contentEl.createDiv();
		btnContainer.style.display = 'flex';
		btnContainer.style.justifyContent = 'flex-end';
		btnContainer.style.gap = '10px';
		btnContainer.style.marginTop = '24px';

		// 取消按钮 — ghost pill
		const cancelBtn = btnContainer.createEl('button', {
			text: this.options.cancelText ?? i18n.t('modals.confirm.cancel'),
		});
		cancelBtn.style.borderRadius = '9999px';
		cancelBtn.style.padding = '8px 20px';
		cancelBtn.style.background = 'transparent';
		cancelBtn.style.color = 'var(--interactive-accent)';
		cancelBtn.style.border = '1px solid var(--interactive-accent)';
		cancelBtn.style.cursor = 'pointer';
		cancelBtn.style.fontSize = 'var(--font-ui-small)';
		cancelBtn.style.transition = 'transform 0.1s ease';
		cancelBtn.addEventListener('click', () => {
			this.settle(false);
		});

		// 确认按钮 — filled pill
		const confirmBtn = btnContainer.createEl('button', {
			text: this.options.confirmText ?? i18n.t('modals.confirm.confirm'),
		});
		confirmBtn.style.borderRadius = '9999px';
		confirmBtn.style.padding = '8px 20px';
		confirmBtn.style.border = 'none';
		confirmBtn.style.cursor = 'pointer';
		confirmBtn.style.fontSize = 'var(--font-ui-small)';
		confirmBtn.style.transition = 'transform 0.1s ease';

		if (this.options.isDestructive) {
			confirmBtn.style.background = 'var(--text-error)';
			confirmBtn.style.color = '#ffffff';
		} else {
			confirmBtn.style.background = 'var(--interactive-accent)';
			confirmBtn.style.color = 'var(--text-on-accent)';
		}

		confirmBtn.addEventListener('click', () => {
			this.settle(true);
		});

		// Apple active 微交互: scale(0.95)
		for (const btn of [cancelBtn, confirmBtn]) {
			btn.addEventListener('pointerdown', () => {
				btn.style.transform = 'scale(0.95)';
			});
			btn.addEventListener('pointerup', () => {
				btn.style.transform = 'scale(1)';
			});
			btn.addEventListener('pointerleave', () => {
				btn.style.transform = 'scale(1)';
			});
		}
	}

	onClose() {
		this.settle(false);
		this.contentEl.empty();
	}

	private settle(value: boolean) {
		if (this.settled) return;
		this.settled = true;
		this.resolve(value);
		this.close();
	}
}

export function showConfirmDialog(
	app: App,
	title: string,
	message: string,
	options?: ConfirmDialogOptions
): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(app, title, message, resolve, options).open();
	});
}

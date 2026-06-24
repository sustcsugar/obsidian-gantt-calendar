import { App, Modal } from 'obsidian';
import { i18n } from '../i18n/i18n';
import { bem, BLOCKS } from '../utils/bem';

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
		msgEl.addClass(bem(BLOCKS.CONFIRM_MODAL, 'message'));

		// 按钮容器
		const btnContainer = contentEl.createDiv();
		btnContainer.addClass(bem(BLOCKS.CONFIRM_MODAL, 'actions'));

		// 取消按钮 — ghost pill
		const cancelBtn = btnContainer.createEl('button', {
			text: this.options.cancelText ?? i18n.t('modals.confirm.cancel'),
		});
		cancelBtn.addClass(bem(BLOCKS.CONFIRM_MODAL, 'button'), bem(BLOCKS.CONFIRM_MODAL, 'button', 'ghost'));
		cancelBtn.addEventListener('click', () => {
			this.settle(false);
		});

		// 确认按钮 — filled pill
		const confirmBtn = btnContainer.createEl('button', {
			text: this.options.confirmText ?? i18n.t('modals.confirm.confirm'),
		});
		confirmBtn.addClass(bem(BLOCKS.CONFIRM_MODAL, 'button'), bem(BLOCKS.CONFIRM_MODAL, 'button', 'filled'));
		if (this.options.isDestructive) {
			confirmBtn.addClass(bem(BLOCKS.CONFIRM_MODAL, 'button', 'destructive'));
		}

		confirmBtn.addEventListener('click', () => {
			this.settle(true);
		});

		// Apple active 微交互: scale(0.95) 由 CSS :active 实现(见 .gc-confirm-modal__button:active)
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

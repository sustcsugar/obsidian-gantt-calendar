import { App, Modal } from 'obsidian';
import type GanttCalendarPlugin from '../../../main';
import { MacaronColorPicker } from '../components';
import { TaskStatus, validateStatusSymbol } from '../../tasks/taskStatus';

/**
 * 添加自定义状态模态框
 */
export class AddCustomStatusModal extends Modal {
	private plugin: GanttCalendarPlugin;
	private nameInput: HTMLInputElement;
	private keyInput: HTMLInputElement;
	private symbolInput: HTMLInputElement;
	private descInput: HTMLTextAreaElement;
	private bgColorInput: HTMLInputElement;
	private textColorInput: HTMLInputElement;
	private nameError?: HTMLElement;
	private symbolError: HTMLElement;
	private onStatusAdded?: () => void; // 添加状态后的回调

	constructor(app: App, plugin: GanttCalendarPlugin, onStatusAdded?: () => void) {
		super(app);
		this.plugin = plugin;
		this.onStatusAdded = onStatusAdded;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('gantt-status-modal');

		contentEl.createEl('h2', { text: '添加自定义状态' });

		// 状态名称
		const nameContainer = contentEl.createDiv();
		nameContainer.style.marginBottom = '16px';
		nameContainer.createEl('label', { text: '状态名称:' });
		this.nameInput = nameContainer.createEl('input', {
			type: 'text',
			placeholder: '例如：等待审核'
		});
		this.nameInput.style.width = '100%';
		this.nameInput.style.marginTop = '8px';
		this.nameInput.style.padding = '8px';
		this.nameInput.style.borderRadius = '4px';
		this.nameInput.style.border = '1px solid var(--background-modifier-border)';

		// 状态 Key
		const keyContainer = contentEl.createDiv();
		keyContainer.style.marginBottom = '16px';
		keyContainer.createEl('label', { text: '状态标识 (英文):' });
		this.keyInput = keyContainer.createEl('input', {
			type: 'text',
			placeholder: '例如：pending_review'
		});
		this.keyInput.style.width = '100%';
		this.keyInput.style.marginTop = '8px';
		this.keyInput.style.padding = '8px';
		this.keyInput.style.borderRadius = '4px';
		this.keyInput.style.border = '1px solid var(--background-modifier-border)';

		// 状态符号
		const symbolContainer = contentEl.createDiv();
		symbolContainer.style.marginBottom = '16px';
		symbolContainer.createEl('label', { text: '复选框符号 (单个字符):' });
		symbolContainer.createEl('div', {
			text: '只能使用字母或数字，不能使用默认状态的符号 (空格, x, !, -, /, ?, n)',
			cls: 'setting-item-description'
		}).style.fontSize = '11px';
		this.symbolInput = symbolContainer.createEl('input', {
			type: 'text',
			placeholder: '例如：p'
		});
		this.symbolInput.style.width = '100%';
		this.symbolInput.style.marginTop = '8px';
		this.symbolInput.style.padding = '8px';
		this.symbolInput.style.borderRadius = '4px';
		this.symbolInput.style.border = '1px solid var(--background-modifier-border)';
		this.symbolInput.maxLength = 1;
		this.symbolError = symbolContainer.createEl('div', {
			cls: 'setting-item-description'
		});
		this.symbolError.style.color = 'var(--text-error)';
		this.symbolError.style.marginTop = '4px';

		// 状态描述
		const descContainer = contentEl.createDiv();
		descContainer.style.marginBottom = '16px';
		descContainer.createEl('label', { text: '状态描述:' });
		this.descInput = descContainer.createEl('textarea', {
			placeholder: '描述此状态的用途'
		});
		this.descInput.style.width = '100%';
		this.descInput.style.marginTop = '8px';
		this.descInput.style.padding = '8px';
		this.descInput.style.borderRadius = '4px';
		this.descInput.style.border = '1px solid var(--background-modifier-border)';
		this.descInput.rows = 2;

		// 卡片颜色选择
		const colorContainer = contentEl.createDiv();
		colorContainer.style.marginBottom = '16px';
		colorContainer.style.display = 'flex';
		colorContainer.style.gap = '24px';

		// 背景色
		const bgColorDiv = colorContainer.createDiv();
		bgColorDiv.createEl('label', { text: '卡片背景颜色:' });
		this.bgColorInput = bgColorDiv.createEl('input', { type: 'color', value: '#FFFFFF' });
		this.bgColorInput.style.width = '60px';
		this.bgColorInput.style.height = '36px';
		this.bgColorInput.style.border = 'none';
		this.bgColorInput.style.padding = '0';
		this.bgColorInput.style.cursor = 'pointer';

		// 文字颜色
		const textColorDiv = colorContainer.createDiv();
		textColorDiv.createEl('label', { text: '卡片文字颜色:' });
		this.textColorInput = textColorDiv.createEl('input', { type: 'color', value: '#333333' });
		this.textColorInput.style.width = '60px';
		this.textColorInput.style.height = '36px';
		this.textColorInput.style.border = 'none';
		this.textColorInput.style.padding = '0';
		this.textColorInput.style.cursor = 'pointer';

		// 马卡龙配色
		const macaronContainer = contentEl.createDiv();
		macaronContainer.style.marginBottom = '16px';
		macaronContainer.createEl('label', { text: '快速选择卡片背景颜色:' });
		const macaronGrid = macaronContainer.createDiv();
		macaronGrid.style.display = 'grid';
		macaronGrid.style.gridTemplateColumns = 'repeat(10, 1fr)';
		macaronGrid.style.gap = '6px';
		macaronGrid.style.marginTop = '8px';

		const macaronPicker = new MacaronColorPicker({
			container: macaronGrid,
			currentColor: this.bgColorInput.value,
			onColorChange: (color) => {
				this.bgColorInput.value = color;
			}
		});
		macaronPicker.render();

		// 按钮容器
		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '12px';
		buttonContainer.style.marginTop = '24px';

		// 取消按钮
		const cancelButton = buttonContainer.createEl('button', { text: '取消' });
		cancelButton.style.padding = '8px 20px';
		cancelButton.style.borderRadius = '6px';
		cancelButton.style.border = '1px solid var(--background-modifier-border)';
		cancelButton.style.background = 'transparent';
		cancelButton.style.cursor = 'pointer';
		cancelButton.addEventListener('click', () => this.close());

		// 添加按钮
		const addButton = buttonContainer.createEl('button', { text: '添加' });
		addButton.style.padding = '8px 20px';
		addButton.style.borderRadius = '6px';
		addButton.style.border = 'none';
		addButton.style.background = 'var(--interactive-accent)';
		addButton.style.color = 'var(--text-on-accent)';
		addButton.style.cursor = 'pointer';
		addButton.addEventListener('click', () => this.addCustomStatus());
	}

	private addCustomStatus() {
		const name = this.nameInput.value.trim();
		const key = this.keyInput.value.trim();
		const symbol = this.symbolInput.value.trim();
		const description = this.descInput.value.trim();
		const backgroundColor = this.bgColorInput.value;
		const textColor = this.textColorInput.value;

		// 验证
		if (!name) {
			this.showNameError('请输入状态名称');
			return;
		}

		if (!key) {
			this.showKeyError('请输入状态标识');
			return;
		}

		if (!symbol) {
			this.symbolError.textContent = '请输入复选框符号';
			return;
		}

		// 验证符号
		const validation = validateStatusSymbol(symbol, true);
		if (!validation.valid) {
			this.symbolError.textContent = validation.error || '符号无效';
			return;
		}

		// 检查 key 是否重复
		if (this.plugin.settings.taskStatuses.some((s: TaskStatus) => s.key === key)) {
			this.showKeyError('状态标识已存在');
			return;
		}

		// 添加新状态
		const newStatus: TaskStatus = {
			key,
			symbol,
			name,
			description: description || '自定义状态',
			backgroundColor,
			textColor,
			isDefault: false
		};

		this.plugin.settings.taskStatuses.push(newStatus);
		this.plugin.saveSettings();
		this.plugin.refreshCalendarViews();
		this.close();

		// 通知设置面板刷新
		if (this.onStatusAdded) {
			this.onStatusAdded();
		}
	}

	private showNameError(message: string): void {
		this.nameError?.remove();
		if (this.nameInput.parentElement) {
			const error = this.nameInput.parentElement.createEl('div', {
				text: message,
				cls: 'setting-item-description'
			});
			if (error.style) {
				error.style.color = 'var(--text-error)';
				error.style.marginTop = '4px';
			}
			this.nameError = error;
		}
	}

	private showKeyError(message: string): void {
		if (this.keyInput.parentElement) {
			const keyError = this.keyInput.parentElement.createEl('div', {
				text: message,
				cls: 'setting-item-description'
			});
			if (keyError.style) {
				keyError.style.color = 'var(--text-error)';
			}
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

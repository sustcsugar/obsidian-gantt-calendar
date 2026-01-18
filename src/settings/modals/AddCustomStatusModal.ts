import { App, Modal } from 'obsidian';
import type GanttCalendarPlugin from '../../../main';
import { MacaronColorPicker } from '../components';
import { TaskStatus, validateStatusSymbol, ThemeColors } from '../../tasks/taskStatus';

/**
 * 添加自定义状态模态框
 * 支持设置亮色和暗色主题的颜色
 */
export class AddCustomStatusModal extends Modal {
	private plugin: GanttCalendarPlugin;
	private nameInput: HTMLInputElement;
	private keyInput: HTMLInputElement;
	private symbolInput: HTMLInputElement;
	private descInput: HTMLTextAreaElement;

	// 亮色主题颜色输入
	private lightBgColorInput: HTMLInputElement;
	private lightTextColorInput: HTMLInputElement;
	private lightBgSwatch?: HTMLElement;
	private lightTextSwatch?: HTMLElement;

	// 暗色主题颜色输入
	private darkBgColorInput: HTMLInputElement;
	private darkTextColorInput: HTMLInputElement;
	private darkBgSwatch?: HTMLElement;
	private darkTextSwatch?: HTMLElement;

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

		// ========== 亮色主题颜色设置 ==========
		const lightSection = contentEl.createDiv();
		lightSection.style.marginBottom = '16px';
		lightSection.style.padding = '12px';
		lightSection.style.background = 'var(--background-secondary)';
		lightSection.style.borderRadius = '8px';
		lightSection.style.border = '1px solid var(--background-modifier-border)';

		const lightHeader = lightSection.createDiv();
		lightHeader.style.display = 'flex';
		lightHeader.style.alignItems = 'center';
		lightHeader.style.gap = '6px';
		lightHeader.style.marginBottom = '12px';
		lightHeader.createEl('span', { text: '☀️' });
		lightHeader.createEl('span', { text: '亮色主题' }).style.fontWeight = '500';

		const lightColorContainer = lightSection.createDiv();
		lightColorContainer.style.display = 'flex';
		lightColorContainer.style.gap = '24px';

		// 亮色背景色
		const lightBgDiv = lightColorContainer.createDiv();
		lightBgDiv.style.display = 'flex';
		lightBgDiv.style.flexDirection = 'column';
		lightBgDiv.style.gap = '6px';
		lightBgDiv.createEl('label', { text: '卡片背景颜色:' });
		const lightBgLabelRow = lightBgDiv.createDiv();
		lightBgLabelRow.style.display = 'flex';
		lightBgLabelRow.style.alignItems = 'center';
		lightBgLabelRow.style.gap = '8px';
		this.lightBgColorInput = lightBgLabelRow.createEl('input', { type: 'color', value: '#FFFFFF' });
		this.lightBgColorInput.style.width = '50px';
		this.lightBgColorInput.style.height = '32px';
		this.lightBgColorInput.style.border = 'none';
		this.lightBgColorInput.style.padding = '0';
		this.lightBgColorInput.style.cursor = 'pointer';
		this.lightBgSwatch = this.createColorSwatch(lightBgLabelRow, '#FFFFFF', this.lightBgColorInput);

		// 亮色文字颜色
		const lightTextDiv = lightColorContainer.createDiv();
		lightTextDiv.style.display = 'flex';
		lightTextDiv.style.flexDirection = 'column';
		lightTextDiv.style.gap = '6px';
		lightTextDiv.createEl('label', { text: '卡片文字颜色:' });
		const lightTextLabelRow = lightTextDiv.createDiv();
		lightTextLabelRow.style.display = 'flex';
		lightTextLabelRow.style.alignItems = 'center';
		lightTextLabelRow.style.gap = '8px';
		this.lightTextColorInput = lightTextLabelRow.createEl('input', { type: 'color', value: '#333333' });
		this.lightTextColorInput.style.width = '50px';
		this.lightTextColorInput.style.height = '32px';
		this.lightTextColorInput.style.border = 'none';
		this.lightTextColorInput.style.padding = '0';
		this.lightTextColorInput.style.cursor = 'pointer';
		this.lightTextSwatch = this.createColorSwatch(lightTextLabelRow, '#333333', this.lightTextColorInput);

		// ========== 暗色主题颜色设置 ==========
		const darkSection = contentEl.createDiv();
		darkSection.style.marginBottom = '16px';
		darkSection.style.padding = '12px';
		darkSection.style.background = 'var(--background-secondary)';
		darkSection.style.borderRadius = '8px';
		darkSection.style.border = '1px solid var(--background-modifier-border)';

		const darkHeader = darkSection.createDiv();
		darkHeader.style.display = 'flex';
		darkHeader.style.alignItems = 'center';
		darkHeader.style.gap = '6px';
		darkHeader.style.marginBottom = '12px';
		darkHeader.createEl('span', { text: '🌙' });
		darkHeader.createEl('span', { text: '暗色主题' }).style.fontWeight = '500';

		const darkColorContainer = darkSection.createDiv();
		darkColorContainer.style.display = 'flex';
		darkColorContainer.style.gap = '24px';

		// 暗色背景色
		const darkBgDiv = darkColorContainer.createDiv();
		darkBgDiv.style.display = 'flex';
		darkBgDiv.style.flexDirection = 'column';
		darkBgDiv.style.gap = '6px';
		darkBgDiv.createEl('label', { text: '卡片背景颜色:' });
		const darkBgLabelRow = darkBgDiv.createDiv();
		darkBgLabelRow.style.display = 'flex';
		darkBgLabelRow.style.alignItems = 'center';
		darkBgLabelRow.style.gap = '8px';
		this.darkBgColorInput = darkBgLabelRow.createEl('input', { type: 'color', value: '#2d333b' });
		this.darkBgColorInput.style.width = '50px';
		this.darkBgColorInput.style.height = '32px';
		this.darkBgColorInput.style.border = 'none';
		this.darkBgColorInput.style.padding = '0';
		this.darkBgColorInput.style.cursor = 'pointer';
		this.darkBgSwatch = this.createColorSwatch(darkBgLabelRow, '#2d333b', this.darkBgColorInput);

		// 暗色文字颜色
		const darkTextDiv = darkColorContainer.createDiv();
		darkTextDiv.style.display = 'flex';
		darkTextDiv.style.flexDirection = 'column';
		darkTextDiv.style.gap = '6px';
		darkTextDiv.createEl('label', { text: '卡片文字颜色:' });
		const darkTextLabelRow = darkTextDiv.createDiv();
		darkTextLabelRow.style.display = 'flex';
		darkTextLabelRow.style.alignItems = 'center';
		darkTextLabelRow.style.gap = '8px';
		this.darkTextColorInput = darkTextLabelRow.createEl('input', { type: 'color', value: '#adbac7' });
		this.darkTextColorInput.style.width = '50px';
		this.darkTextColorInput.style.height = '32px';
		this.darkTextColorInput.style.border = 'none';
		this.darkTextColorInput.style.padding = '0';
		this.darkTextColorInput.style.cursor = 'pointer';
		this.darkTextSwatch = this.createColorSwatch(darkTextLabelRow, '#adbac7', this.darkTextColorInput);

		// 马卡龙配色（仅用于亮色背景）
		const macaronContainer = contentEl.createDiv();
		macaronContainer.style.marginBottom = '16px';
		macaronContainer.createEl('label', { text: '快速选择亮色背景颜色:' });
		const macaronGrid = macaronContainer.createDiv();
		macaronGrid.style.display = 'grid';
		macaronGrid.style.gridTemplateColumns = 'repeat(10, 1fr)';
		macaronGrid.style.gap = '6px';
		macaronGrid.style.marginTop = '8px';

		const macaronPicker = new MacaronColorPicker({
			container: macaronGrid,
			currentColor: this.lightBgColorInput.value,
			onColorChange: (color) => {
				this.lightBgColorInput.value = color;
				if (this.lightBgSwatch) {
					this.lightBgSwatch.style.backgroundColor = color;
				}
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

	/**
	 * 创建颜色方块
	 */
	private createColorSwatch(container: HTMLElement, color: string, input: HTMLInputElement): HTMLElement {
		const swatch = container.createEl('div');
		swatch.style.width = '32px';
		swatch.style.height = '32px';
		swatch.style.borderRadius = '4px';
		swatch.style.backgroundColor = color;
		swatch.style.border = '1px solid var(--background-modifier-border)';
		swatch.style.cursor = 'pointer';
		swatch.addEventListener('click', () => input.click());
		input.addEventListener('input', () => {
			swatch.style.backgroundColor = input.value;
		});
		return swatch;
	}

	private addCustomStatus() {
		const name = this.nameInput.value.trim();
		const key = this.keyInput.value.trim();
		const symbol = this.symbolInput.value.trim();
		const description = this.descInput.value.trim();

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

		// 添加新状态（使用新的主题分离颜色格式）
		const newStatus: TaskStatus = {
			key,
			symbol,
			name,
			description: description || '自定义状态',
			lightColors: {
				backgroundColor: this.lightBgColorInput.value,
				textColor: this.lightTextColorInput.value
			},
			darkColors: {
				backgroundColor: this.darkBgColorInput.value,
				textColor: this.darkTextColorInput.value
			},
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

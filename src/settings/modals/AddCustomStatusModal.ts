import { App, Modal } from 'obsidian';
import type GanttCalendarPlugin from '../../../main';
import { MacaronColorPicker } from '../components';
import { SettingsStatusModalClasses } from '../../utils/bem';
import { TaskStatus, validateStatusSymbol } from '../../tasks/taskStatus';
import { i18n } from '../../i18n/i18n';

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

	private lightBgColorInput: HTMLInputElement;
	private lightTextColorInput: HTMLInputElement;
	private lightBgSwatch?: HTMLElement;
	private lightTextSwatch?: HTMLElement;

	private darkBgColorInput: HTMLInputElement;
	private darkTextColorInput: HTMLInputElement;
	private darkBgSwatch?: HTMLElement;
	private darkTextSwatch?: HTMLElement;

	private nameError?: HTMLElement;
	private symbolError: HTMLElement;
	private onStatusAdded?: () => void;

	constructor(app: App, plugin: GanttCalendarPlugin, onStatusAdded?: () => void) {
		super(app);
		this.plugin = plugin;
		this.onStatusAdded = onStatusAdded;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		const cls = SettingsStatusModalClasses.elements;

		contentEl.createEl('h2', { text: i18n.t('modals.addStatus.title'), cls: cls.title });

		// 状态名称
		const nameField = contentEl.createDiv(cls.field);
		nameField.createEl('label', { text: i18n.t('modals.addStatus.name.label'), cls: cls.label });
		this.nameInput = nameField.createEl('input', {
			type: 'text',
			placeholder: i18n.t('modals.addStatus.name.placeholder'),
			cls: cls.input,
		});

		// 状态 Key
		const keyField = contentEl.createDiv(cls.field);
		keyField.createEl('label', { text: i18n.t('modals.addStatus.key.label'), cls: cls.label });
		this.keyInput = keyField.createEl('input', {
			type: 'text',
			placeholder: i18n.t('modals.addStatus.key.placeholder'),
			cls: cls.input,
		});

		// 状态符号
		const symbolField = contentEl.createDiv(cls.field);
		symbolField.createEl('label', { text: i18n.t('modals.addStatus.symbol.label'), cls: cls.label });
		symbolField.createDiv(cls.hint)
			.setText(i18n.t('modals.addStatus.symbol.hint'));
		this.symbolInput = symbolField.createEl('input', {
			type: 'text',
			placeholder: i18n.t('modals.addStatus.symbol.placeholder'),
			cls: cls.input,
		});
		this.symbolInput.maxLength = 1;
		this.symbolError = symbolField.createDiv(cls.error);

		// 状态描述
		const descField = contentEl.createDiv(cls.field);
		descField.createEl('label', { text: i18n.t('modals.addStatus.description.label'), cls: cls.label });
		this.descInput = descField.createEl('textarea', {
			placeholder: i18n.t('modals.addStatus.description.placeholder'),
			cls: cls.textarea,
		});
		this.descInput.rows = 2;

		// 亮色主题
		this.renderThemeSection(contentEl, 'light');
		// 暗色主题
		this.renderThemeSection(contentEl, 'dark');

		// 马卡龙配色（仅用于亮色背景）
		const macaronField = contentEl.createDiv(cls.field);
		macaronField.createEl('label', { text: i18n.t('modals.addStatus.colors.macaronLabel'), cls: cls.label });
		const macaronContainer = macaronField.createDiv();
		new MacaronColorPicker({
			container: macaronContainer,
			currentColor: this.lightBgColorInput.value,
			onColorChange: (color) => {
				this.lightBgColorInput.value = color;
				if (this.lightBgSwatch) {
					this.lightBgSwatch.style.backgroundColor = color;
				}
			},
		}).render();

		// 按钮容器
		const footer = contentEl.createDiv(cls.footer);
		const cancelBtn = footer.createEl('button', { text: i18n.t('common.cancel'), cls: cls.btn });
		cancelBtn.addEventListener('click', () => this.close());

		const addBtn = footer.createEl('button', {
			text: i18n.t('common.add'),
			cls: `${cls.btn} ${SettingsStatusModalClasses.modifiers.btnPrimary}`,
		});
		addBtn.addEventListener('click', () => this.addCustomStatus());
	}

	private renderThemeSection(
		parent: HTMLElement,
		theme: 'light' | 'dark'
	): void {
		const cls = SettingsStatusModalClasses.elements;
		const section = parent.createDiv(cls.themeSection);

		const header = section.createDiv(cls.themeHeader);
		header.setText(theme === 'light' ? i18n.t('modals.addStatus.colors.lightTheme') : i18n.t('modals.addStatus.colors.darkTheme'));

		const colorRow = section.createDiv(cls.colorRow);

		const defaultBg = theme === 'dark' ? '#2d333b' : '#FFFFFF';
		const defaultText = theme === 'dark' ? '#adbac7' : '#333333';

		const bgInput = this.createColorField(colorRow, i18n.t('modals.addStatus.colors.background'), defaultBg);
		const textInput = this.createColorField(colorRow, i18n.t('modals.addStatus.colors.text'), defaultText);

		if (theme === 'light') {
			this.lightBgColorInput = bgInput.input;
			this.lightBgSwatch = bgInput.swatch;
			this.lightTextColorInput = textInput.input;
			this.lightTextSwatch = textInput.swatch;
		} else {
			this.darkBgColorInput = bgInput.input;
			this.darkBgSwatch = bgInput.swatch;
			this.darkTextColorInput = textInput.input;
			this.darkTextSwatch = textInput.swatch;
		}
	}

	private createColorField(
		parent: HTMLElement,
		label: string,
		defaultColor: string
	): { input: HTMLInputElement; swatch: HTMLElement } {
		const cls = SettingsStatusModalClasses.elements;
		const field = parent.createDiv(cls.colorField);
		field.createEl('span', { text: label, cls: cls.colorLabel });

		const wrapper = field.createDiv(cls.swatchWrapper);
		const input = wrapper.createEl('input', {
			type: 'color',
			cls: cls.hiddenInput,
		});
		input.value = defaultColor;

		const swatch = wrapper.createDiv(cls.swatch);
		swatch.style.backgroundColor = defaultColor;

		swatch.addEventListener('click', () => input.click());
		input.addEventListener('input', () => {
			swatch.style.backgroundColor = input.value;
		});

		return { input, swatch };
	}

	private addCustomStatus() {
		const name = this.nameInput.value.trim();
		const key = this.keyInput.value.trim();
		const symbol = this.symbolInput.value.trim();
		const description = this.descInput.value.trim();

		if (!name) {
			this.showFieldError(this.nameInput, i18n.t('modals.editStatus.name.errorEmpty'));
			return;
		}

		if (!key) {
			this.showFieldError(this.keyInput, i18n.t('modals.addStatus.symbol.errorDuplicate'));
			return;
		}

		if (!symbol) {
			this.symbolError.textContent = i18n.t('modals.addStatus.symbol.errorEmpty');
			return;
		}

		const validation = validateStatusSymbol(symbol, true);
		if (!validation.valid) {
			this.symbolError.textContent = validation.error || i18n.t('modals.addStatus.symbol.errorInvalid');
			return;
		}

		if (this.plugin.settings.taskStatuses.some((s: TaskStatus) => s.key === key)) {
			this.showFieldError(this.keyInput, i18n.t('modals.addStatus.symbol.errorDuplicate'));
			return;
		}

		const newStatus: TaskStatus = {
			key,
			symbol,
			name,
			description: description || i18n.t('taskStatus.customDefault'),
			lightColors: {
				backgroundColor: this.lightBgColorInput.value,
				textColor: this.lightTextColorInput.value,
			},
			darkColors: {
				backgroundColor: this.darkBgColorInput.value,
				textColor: this.darkTextColorInput.value,
			},
			isDefault: false,
		};

		this.plugin.settings.taskStatuses.push(newStatus);
		this.plugin.saveSettings();
		this.plugin.refreshCalendarViews();
		this.close();

		if (this.onStatusAdded) {
			this.onStatusAdded();
		}
	}

	private showFieldError(inputEl: HTMLInputElement, message: string): void {
		const cls = SettingsStatusModalClasses.elements;
		const field = inputEl.closest(`.${cls.field}`) as HTMLElement;
		if (!field) return;
		const existing = field.querySelector(`.${cls.error}`);
		if (existing) existing.remove();
		field.createDiv(cls.error).setText(message);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

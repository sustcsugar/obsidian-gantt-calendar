import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { CalendarView, CALENDAR_VIEW_ID } from './src/CalendarView';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
	yearViewRowGap: number;
	yearViewColumnGap: number;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	yearViewRowGap: 0,
	yearViewColumnGap: 0
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// Register the calendar view
		this.registerView(CALENDAR_VIEW_ID, (leaf) => new CalendarView(leaf, this));

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('calendar-days', '甘特日历', (evt: MouseEvent) => {
			// Open calendar view in a new leaf in main editor
			this.activateView();
		});
		ribbonIconEl.addClass('gantt-calendar-ribbon');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'gantt-calendar-common',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'gantt-calendar-editor',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'gantt-calendar-conditional',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async activateView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(CALENDAR_VIEW_ID)[0];
		if (!leaf) {
			// Create new leaf in main area
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({
				type: CALENDAR_VIEW_ID,
				active: true,
			});
		}

		workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	refreshCalendarViews() {
		const leaves = this.app.workspace.getLeavesOfType(CALENDAR_VIEW_ID);
		leaves.forEach(leaf => {
			const view = leaf.view as CalendarView;
			if (view && view.refreshSettings) {
				view.refreshSettings();
			}
		});
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: '年视图设置'});

		new Setting(containerEl)
			.setName('日期行间距')
			.setDesc('调整年视图中日期之间的垂直间距（0-10像素）')
			.addSlider(slider => slider
				.setLimits(0, 10, 0.5)
				.setValue(this.plugin.settings.yearViewRowGap)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.yearViewRowGap = value;
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarViews();
				}));

		new Setting(containerEl)
			.setName('日期列间距')
			.setDesc('调整年视图中日期之间的水平间距（0-10像素）')
			.addSlider(slider => slider
				.setLimits(0, 10, 0.5)
				.setValue(this.plugin.settings.yearViewColumnGap)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.yearViewColumnGap = value;
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarViews();
				}));
	}
}

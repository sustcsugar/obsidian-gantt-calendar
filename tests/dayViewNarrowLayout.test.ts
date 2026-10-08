/**
 * @jest-environment jsdom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DayView } from '../src/ui/views/DayView';
import { PluginContext } from '../src/ui/pluginContext';
import { useCalendarStore } from '../src/ui/store/calendarStore';
import { DayViewClasses } from '../src/utils/bem';
import { Platform } from 'obsidian';
import type { IPluginContext } from '../src/types';

const plugin = {
	app: {
		workspace: {
			rootSplit: {},
		},
		vault: {
			getAbstractFileByPath: () => null,
		},
	},
	settings: {
		enableDailyNote: true,
		dayViewLayout: 'horizontal',
		startOnMonday: false,
		taskStatuses: [],
	},
	dailyNoteIndex: {},
	saveSettings: async () => {},
	refreshCalendarViews: () => {},
	taskCache: {
		getAllTasks: () => [],
		refreshFile: async () => {},
	},
} as unknown as IPluginContext;

function installMatchMedia(matches: boolean): void {
	window.matchMedia = (query: string) => ({
		matches: query === '(max-width: 520px)' ? matches : false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	});
}

function installObsidianElementExtensions(): void {
	const proto = HTMLElement.prototype as unknown as {
		empty: (this: HTMLElement) => void;
		createDiv: (this: HTMLElement, options?: { text?: string; cls?: string }) => HTMLDivElement;
	};
	proto.empty = function empty(this: HTMLElement) {
		this.replaceChildren();
	};
	proto.createDiv = function createDiv(this: HTMLElement, options?: { text?: string; cls?: string }) {
		const child = document.createElement('div');
		if (options?.cls) child.className = options.cls;
		if (options?.text) child.textContent = options.text;
		this.appendChild(child);
		return child;
	};
}
describe('DayView narrow layout', () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeAll(() => {
	installObsidianElementExtensions();
	});

	beforeEach(() => {
		(window as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		useCalendarStore.setState({ viewType: 'day', tasks: [], tasksReady: true });
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => {
			root.unmount();
		});
		container.remove();
		Platform.isPhone = false;
	});

	test('narrow desktop windows stack the day view instead of shrinking side-by-side panes', async () => {
		installMatchMedia(true);

		await act(async () => {
			root.render(createElement(PluginContext.Provider, { value: plugin }, createElement(DayView)));
		});

		expect(container.getElementsByClassName(DayViewClasses.modifiers.vertical).length).toBe(1);
		expect(container.getElementsByClassName(DayViewClasses.modifiers.horizontal).length).toBe(0);
	});

	test('wide desktop windows preserve the configured horizontal layout', async () => {
		installMatchMedia(false);

		await act(async () => {
			root.render(createElement(PluginContext.Provider, { value: plugin }, createElement(DayView)));
		});

		expect(container.getElementsByClassName(DayViewClasses.modifiers.horizontal).length).toBe(1);
		expect(container.getElementsByClassName(DayViewClasses.modifiers.vertical).length).toBe(0);
	});
});



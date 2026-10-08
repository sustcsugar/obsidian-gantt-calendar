/**
 * @jest-environment jsdom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../src/ui/App';
import { PluginContext } from '../src/ui/pluginContext';
import { useCalendarStore } from '../src/ui/store/calendarStore';
import { CalendarSkeletonClasses } from '../src/utils/bem';
import type { GCTask, IPluginContext } from '../src/types';

/**
 * P0 骨架先行的视图侧验收：tasksReady=false 时内容区渲染骨架，
 * 数据推入（whenReady/事件回流任一路径）后骨架移除、真实视图接管。
 */
function makeTask(id: number): GCTask {
	return {
		filePath: `note-${id}.md`,
		fileName: `note-${id}.md`,
		lineNumber: id,
		content: `- [ ] task ${id}`,
		description: `task ${id}`,
		completed: false,
		priority: 'normal',
	};
}

const plugin = {
	app: {} as IPluginContext['app'],
	settings: {
		defaultView: 'year',
		showViewNavButtonText: true,
		startOnMonday: false,
		taskStatuses: [],
		taskViewDateRangeMode: 'week',
		taskViewTimeFieldFilter: 'dueDate',
	} as unknown as IPluginContext['settings'],
	saveSettings: async () => {},
	refreshCalendarViews: () => {},
	taskCache: {
		getAllTasks: () => [] as GCTask[],
		refreshFile: async () => {},
		onUpdate: () => {},
		offUpdate: () => {},
		initialize: async () => {},
		whenReady: async () => {},
	},
};

describe('App 骨架渲染（tasksReady 门控）', () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeAll(() => {
		if (!window.matchMedia) {
			window.matchMedia = (query: string) => ({
				matches: false,
				media: query,
				onchange: null,
				addListener: () => {},
				removeListener: () => {},
				addEventListener: () => {},
				removeEventListener: () => {},
				dispatchEvent: () => false,
			});
		}
	});

	beforeEach(() => {
		(window as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		useCalendarStore.setState({ tasks: [], tasksReady: false, viewType: 'year' });
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => {
			root.unmount();
		});
		container.remove();
	});

	test('未就绪渲染骨架；setTasks 后骨架移除', async () => {
		await act(async () => {
			root.render(
				createElement(PluginContext.Provider, { value: plugin }, createElement(App))
			);
		});

		expect(container.getElementsByClassName(CalendarSkeletonClasses.block).length).toBeGreaterThan(0);

		await act(async () => {
			useCalendarStore.getState().setTasks([makeTask(1)]);
		});

		expect(container.getElementsByClassName(CalendarSkeletonClasses.block).length).toBe(0);
	});
});





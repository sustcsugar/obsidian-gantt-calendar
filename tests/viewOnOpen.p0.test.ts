import { GCMainView } from '../src/GCMainView';
import { GCSidebarView } from '../src/GCSidebarView';
import { useCalendarStore } from '../src/ui/store/calendarStore';
import type { GCTask, IPluginContext } from '../src/types';
import { Logger } from '../src/utils/logger';

/**
 * P0 启动解耦：视图 onOpen 不得 await 全库首扫（whenReady）。
 * 根因见 docs/report-startup-layout-block-2026-09-23.md §4：
 * onOpen 等首扫 ↔ 首扫被钉在 onLayoutReady 之后 ↔ layout 恢复等 onOpen，
 * 三者成环，把 ~1s 的扫描放大成 ~10s 的 Load layout 卡顿。
 */
jest.mock('../src/ui/reactBridge', () => ({
	mountReact: jest.fn(() => jest.fn()),
}));

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

interface Deferred {
	promise: Promise<void>;
	resolve: () => void;
	reject: (reason?: unknown) => void;
}

function deferred(): Deferred {
	let resolve!: () => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function makePlugin(tasks: GCTask[], ready: Deferred) {
	const listeners = new Set<(filePath?: string) => void>();
	const plugin = {
		settings: { defaultView: 'week' as const },
		taskCache: {
			getAllTasks: () => tasks,
			whenReady: () => ready.promise,
			onUpdate: (listener: (filePath?: string) => void) => listeners.add(listener),
			offUpdate: (listener: (filePath?: string) => void) => listeners.delete(listener),
		},
	} as unknown as IPluginContext;
	return { plugin, listeners };
}

async function flushAsync(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

	jest.setTimeout(1000);
describe('P0：视图 onOpen 与数据就绪解耦', () => {
		// 失败兜底路径会按设计打 Logger.error，测试中静音保持输出干净
		jest.spyOn(Logger, 'error').mockImplementation(() => {});
	beforeEach(() => {
		useCalendarStore.setState({ tasks: [], tasksReady: false });
	});

	test('GCMainView.onOpen 在 whenReady 未结算时立即返回，且订阅先行', async () => {
		const tasks = [makeTask(1)];
		const ready = deferred();
		const { plugin, listeners } = makePlugin(tasks, ready);
		const view = new GCMainView({} as never, plugin);

		const result = await Promise.race([
			view.onOpen().then(() => 'opened'),
			new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 50)),
		]);

		expect(result).toBe('opened');
		// 骨架仍在：数据未就绪
		expect(useCalendarStore.getState().tasksReady).toBe(false);
		// 订阅先行：避免首扫完成通知早于订阅而丢失
		expect(listeners.size).toBe(1);

		ready.resolve();
		await flushAsync();

		expect(useCalendarStore.getState().tasksReady).toBe(true);
		expect(useCalendarStore.getState().tasks).toBe(tasks);
	});

	test('GCMainView：whenReady 失败时以空任务集解除骨架，不再永久挂起', async () => {
		const ready = deferred();
		const { plugin } = makePlugin([], ready);
		const view = new GCMainView({} as never, plugin);

		await view.onOpen();
		ready.reject(new Error('scan failed'));
		await flushAsync();

		expect(useCalendarStore.getState().tasksReady).toBe(true);
		expect(useCalendarStore.getState().tasks).toEqual([]);
	});

	test('GCSidebarView.onOpen 同样立即返回，数据就绪后填充', async () => {
		const tasks = [makeTask(3)];
		const ready = deferred();
		const { plugin, listeners } = makePlugin(tasks, ready);
		const view = new GCSidebarView({} as never, plugin);

		await view.onOpen();

		expect(useCalendarStore.getState().tasksReady).toBe(false);
		expect(listeners.size).toBe(1);

		ready.resolve();
		await flushAsync();

		expect(useCalendarStore.getState().tasksReady).toBe(true);
		expect(useCalendarStore.getState().tasks).toBe(tasks);
	});
});


/** @jest-environment jsdom */
import GanttCalendarPlugin from '../main';
import { useCalendarStore } from '../src/ui/store/calendarStore';
import { Logger } from '../src/utils/logger';

// 截断与被测行为无关的重依赖子树（main.ts 仅在 onload 使用它们，
// 本测试只驱动 scheduleTaskCacheInit 的数据回调路径）
jest.mock('../src/settings', () => ({ GanttCalendarSettingTab: class {} }));
jest.mock('../src/commands/commandsIndex', () => ({ registerAllCommands: () => {} }));
jest.mock('../src/ui/modals/modalHost', () => ({ initModalHost: () => {}, destroyModalHost: () => {} }));
jest.mock('../src/ui/reactBridge', () => ({ mountReact: jest.fn(() => jest.fn()) }));

/**
 * P1：首扫完成后不得触发整视图重挂。
 *
 * 根因链：main.ts 曾在 taskCache.initialize() 成功回调里调用
 * refreshCalendarViews() → view.refreshSettings() → bumpSettings()
 * → settingsVersion++ → App.tsx AnimatePresence key 变化
 * → 数据刚填充又整树卸载重挂（用户可见闪烁/重排）。
 *
 * 数据推送已由 TaskStore.notifyListeners()（onUpdate）与视图
 * whenReady().then(setTasks) 承担，首扫完成只应推数据，不应动
 * settingsVersion。设置页等真实设置变更路径（BaseBuilder 等）
 * 仍走 refreshCalendarViews → bumpSettings，不在本测试范围。
 */
describe('P1：首扫完成后不整视图重挂', () => {
	beforeEach(() => {
		jest.spyOn(Logger, 'stats').mockImplementation(() => {});
		jest.spyOn(Logger, 'error').mockImplementation(() => {});
		useCalendarStore.setState({ settingsVersion: 0 });
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	test('taskCache.initialize 完成后 settingsVersion 不变（不触发 refreshAllViews）', async () => {
		const refreshAllViews = jest.fn();
		const layoutCallbacks: Array<() => void> = [];
		const plugin = new GanttCalendarPlugin({
			workspace: { onLayoutReady: (cb: () => void) => layoutCallbacks.push(cb) },
			vault: { adapter: { exists: async () => false } },
		} as never, {} as never);
		const asAny = plugin as unknown as Record<string, unknown>;
		asAny.viewManager = { refreshAllViews };
		asAny.settings = { globalTaskFilter: '', enabledTaskFormats: ['tasks'] };
		asAny.taskCache = { initialize: jest.fn(() => Promise.resolve()) };

		(asAny.scheduleTaskCacheInit as () => void)();
		layoutCallbacks.forEach(cb => cb());

		// 等 setTimeout(0) + initialize().then() 链结算
		await new Promise(resolve => setTimeout(resolve, 20));

		expect(refreshAllViews).not.toHaveBeenCalled();
		expect(useCalendarStore.getState().settingsVersion).toBe(0);
	});
});



import { useCalendarStore } from '../calendarStore';
import type { GCTask } from '../../../types';

/**
 * P0 骨架先行配套：tasksReady 标志驱动视图在首扫完成前渲染骨架。
 * 数据经 setTasks（whenReady 推入）或 notifyTasksUpdated（事件回流）
 * 任一路径到达时，都必须解除骨架。
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

describe('calendarStore tasksReady（P0 启动解耦）', () => {
	beforeEach(() => {
		useCalendarStore.setState({ tasks: [], tasksReady: false });
	});

	test('初始状态：任务未就绪，视图应渲染骨架', () => {
		expect(useCalendarStore.getState().tasksReady).toBe(false);
	});

	test('setTasks 推入数据后标记就绪（whenReady 路径）', () => {
		useCalendarStore.getState().setTasks([makeTask(1)]);

		expect(useCalendarStore.getState().tasksReady).toBe(true);
	});

	test('notifyTasksUpdated 事件回流后标记就绪（订阅路径）', () => {
		useCalendarStore.getState().notifyTasksUpdated([makeTask(2)]);

		expect(useCalendarStore.getState().tasksReady).toBe(true);
	});
});

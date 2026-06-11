/**
 * 飞书字段映射 — 单元测试
 * 对应测试用例: FS-20, FS-21
 */

import {
	toFeishuTaskPayload,
	toFeishuCompleted,
	fromFeishuTask,
	mapObsidianToFeishuPriority,
	mapFeishuToObsidianPriority,
	dateToFeishuTimestamp,
	feishuTimestampToDate,
	feishuTimeToDate,
} from '../src/data-layer/feishu-sync/taskMapper';
import type { GCTask } from '../src/types';
import type { FeishuTask, FeishuTaskTime } from '../src/data-layer/sources/api/providers/feishu/FeishuTypes';

function makeGCTask(overrides: Partial<GCTask> = {}): GCTask {
	return {
		filePath: 'test.md',
		fileName: 'test.md',
		lineNumber: 1,
		content: '- [ ] 测试任务',
		description: '测试任务',
		completed: false,
		priority: 'normal',
		status: 'todo',
		...overrides,
	};
}

describe('飞书字段映射', () => {
	// ==================== 优先级映射 ====================
	describe('FS-20: 优先级映射', () => {
		describe('mapObsidianToFeishuPriority (6→3)', () => {
			it('FS-20a: highest → high', () => expect(mapObsidianToFeishuPriority('highest')).toBe('high'));
			it('FS-20b: high → high', () => expect(mapObsidianToFeishuPriority('high')).toBe('high'));
			it('FS-20c: medium → normal', () => expect(mapObsidianToFeishuPriority('medium')).toBe('normal'));
			it('FS-20d: normal → normal', () => expect(mapObsidianToFeishuPriority('normal')).toBe('normal'));
			it('FS-20e: low → low', () => expect(mapObsidianToFeishuPriority('low')).toBe('low'));
			it('FS-20f: lowest → low', () => expect(mapObsidianToFeishuPriority('lowest')).toBe('low'));
		});

		describe('mapFeishuToObsidianPriority (3→6)', () => {
			it('FS-20g1: high → high', () => expect(mapFeishuToObsidianPriority('high')).toBe('high'));
			it('FS-20g2: normal → normal', () => expect(mapFeishuToObsidianPriority('normal')).toBe('normal'));
			it('FS-20g3: low → low', () => expect(mapFeishuToObsidianPriority('low')).toBe('low'));
			it('FS-20g: 未知值 → normal', () => expect(mapFeishuToObsidianPriority('unknown')).toBe('normal'));
		});
	});

	// ==================== 日期转换 ====================
	describe('FS-21: 日期转换', () => {
		it('FS-21a: dateToFeishuTimestamp: Date → 毫秒时间戳字符串', () => {
			const date = new Date('2024-06-15T10:30:00.000Z');
			const ts = dateToFeishuTimestamp(date);
			expect(ts).toBe(String(date.getTime()));
			expect(parseInt(ts)).toBe(date.getTime());
		});

		it('FS-21b: feishuTimestampToDate: 毫秒时间戳 → Date', () => {
			const ts = '1718448600000';
			const date = feishuTimestampToDate(ts);
			expect(date).toBeInstanceOf(Date);
			expect(date!.getTime()).toBe(1718448600000);
		});

		it('FS-21c: feishuTimestampToDate: 无效时间戳 → undefined', () => {
			expect(feishuTimestampToDate('abc')).toBeUndefined();
		});

		it('FS-21d: feishuTimeToDate: FeishuTaskTime → Date', () => {
			const time: FeishuTaskTime = { timestamp: '1718448600000' };
			const date = feishuTimeToDate(time);
			expect(date).toBeInstanceOf(Date);
		});

		it('FS-21e: feishuTimeToDate: undefined → undefined', () => {
			expect(feishuTimeToDate(undefined)).toBeUndefined();
		});

		it('FS-21f: feishuTimeToDate: 无 timestamp → undefined', () => {
			expect(feishuTimeToDate({})).toBeUndefined();
		});

		it('FS-21g: 日期往返无损', () => {
			const original = new Date('2024-06-15T10:30:00.000Z');
			const ts = dateToFeishuTimestamp(original);
			const restored = feishuTimestampToDate(ts);
			expect(restored!.getTime()).toBe(original.getTime());
		});
	});

	// ==================== GCTask → Feishu ====================
	describe('toFeishuTaskPayload', () => {
		it('FS-20h: 基本任务映射', () => {
			const task = makeGCTask({ description: '测试任务' });
			const payload = toFeishuTaskPayload(task);
			expect(payload.summary).toBe('测试任务');
		});

		it('FS-21h: 含 dueDate 时映射 due 字段', () => {
			const task = makeGCTask({ dueDate: new Date('2024-06-15') });
			const payload = toFeishuTaskPayload(task);
			expect(payload.due).toBeDefined();
			expect(payload.due!.timestamp).toBe(String(task.dueDate!.getTime()));
		});

		it('FS-21i: 含 startDate 时映射 start 字段', () => {
			const task = makeGCTask({ startDate: new Date('2024-06-10') });
			const payload = toFeishuTaskPayload(task);
			expect(payload.start).toBeDefined();
		});

		it('FS-20i: 高优先级映射', () => {
			const task = makeGCTask({ priority: 'high' });
			const payload = toFeishuTaskPayload(task);
			expect(payload.priority).toBe('high');
		});

		it('FS-20j: normal 优先级不输出', () => {
			const task = makeGCTask({ priority: 'normal' });
			const payload = toFeishuTaskPayload(task);
			expect(payload.priority).toBeUndefined();
		});

		it('FS-20k: 清理 markdown 链接', () => {
			const task = makeGCTask({ description: '查看 [文档](https://example.com)' });
			const payload = toFeishuTaskPayload(task);
			expect(payload.summary).toBe('查看 文档');
		});

		it('FS-20l: wikilink 带别名 — 原样保留', () => {
			const task = makeGCTask({ description: '参考 [[我的笔记|笔记别名]]' });
			const payload = toFeishuTaskPayload(task);
			expect(payload.summary).toBe('参考 [[我的笔记|笔记别名]]');
		});

		it('FS-20m: wikilink 无别名 — 原样保留', () => {
			const task = makeGCTask({ description: '参考 [[我的笔记]]' });
			const payload = toFeishuTaskPayload(task);
			expect(payload.summary).toBe('参考 [[我的笔记]]');
		});
	});

	describe('toFeishuCompleted', () => {
		it('FS-20n: 未完成 → false', () => {
			expect(toFeishuCompleted(makeGCTask({ completed: false }))).toBe(false);
		});

		it('FS-20o: 已完成 → true', () => {
			expect(toFeishuCompleted(makeGCTask({ completed: true }))).toBe(true);
		});
	});

	// ==================== Feishu → GCTask ====================
	describe('fromFeishuTask', () => {
		it('FS-20p: 基本字段映射', () => {
			const feishu: FeishuTask = {
				task_guid: 'guid-123',
				summary: '飞书任务',
				completed: false,
			};
			const updates = fromFeishuTask(feishu);
			expect(updates.feishuGuid).toBe('guid-123');
			expect(updates.description).toBe('飞书任务');
			expect(updates.completed).toBe(false);
		});

		it('FS-21j: due_time → dueDate', () => {
			const millis = new Date('2024-06-15').getTime();
			const feishu: FeishuTask = {
				task_guid: 'guid-1',
				summary: '任务',
				due_time: { timestamp: String(millis) },
			};
			const updates = fromFeishuTask(feishu);
			expect(updates.dueDate).toBeInstanceOf(Date);
			expect(updates.dueDate!.getTime()).toBe(millis);
		});

		it('FS-21k: start_time → startDate', () => {
			const millis = new Date('2024-06-10').getTime();
			const feishu: FeishuTask = {
				task_guid: 'guid-1',
				summary: '任务',
				start_time: { timestamp: String(millis) },
			};
			const updates = fromFeishuTask(feishu);
			expect(updates.startDate).toBeInstanceOf(Date);
		});

		it('FS-20q: priority 映射', () => {
			const feishu: FeishuTask = {
				task_guid: 'guid-1',
				summary: '任务',
				priority: 'high',
			};
			const updates = fromFeishuTask(feishu);
			expect(updates.priority).toBe('high');
		});

		it('FS-20r: 空任务返回空对象', () => {
			const feishu: FeishuTask = {
				task_guid: '',
				summary: '',
			};
			const updates = fromFeishuTask(feishu);
			expect(Object.keys(updates)).toHaveLength(0);
		});
	});
});

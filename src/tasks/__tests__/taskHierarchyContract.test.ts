import type { App } from 'obsidian';
import type { GCTask } from '../../types';
import { parseSingleTaskLine } from '../taskParser/main';
import { serializeTask, type TaskUpdates } from '../taskSerializer';

/** 只提供 serializeTask 需要的插件设置访问面 */
const fakeApp = {
	plugins: { getPlugin: () => ({ settings: {} }) },
} as unknown as App;

function makeTask(overrides: Partial<GCTask> = {}): GCTask {
	return {
		filePath: 'notes/project.md',
		fileName: 'project',
		lineNumber: 3,
		content: '- [ ] 任务',
		description: '任务',
		completed: false,
		priority: 'normal',
		...overrides,
	};
}

function serialize(task: GCTask, updates: TaskUpdates = {}, format: 'tasks' | 'dataview' = 'tasks'): string {
	return serializeTask(fakeApp, task, updates, format);
}

describe('任务层级字段解析', () => {
	it('从 %%[tid:: x]%% 派生 tid', () => {
		const task = parseSingleTaskLine('- [ ] 父任务 %%[tid:: k3m9x2qa]%%', 'a.md', 'a', 1);
		expect(task?.tid).toBe('k3m9x2qa');
		expect(task?.parentTid).toBeUndefined();
	});

	it('从 %%[parent:: x]%% 派生 parentTid', () => {
		const task = parseSingleTaskLine('- [ ] 子任务 %%[parent:: k3m9x2qa]%%', 'a.md', 'a', 1);
		expect(task?.parentTid).toBe('k3m9x2qa');
		expect(task?.tid).toBeUndefined();
	});

	it('同时存在时不污染描述', () => {
		const task = parseSingleTaskLine(
			'- [ ] 子任务 %%[parent:: k3m9x2qa]%% %%[tid:: zzzz1111]%%',
			'a.md', 'a', 1
		);
		expect(task?.description).toBe('子任务');
		expect(task?.parentTid).toBe('k3m9x2qa');
		expect(task?.tid).toBe('zzzz1111');
	});

	it('保留普通元数据不受影响', () => {
		const task = parseSingleTaskLine('- [ ] 任务 %%[project:: obsidian]%%', 'a.md', 'a', 1);
		expect(task?.metadataFields).toEqual([{ key: 'project', value: 'obsidian' }]);
	});

	it('往返：序列化后再解析，层级字段一致', () => {
		const task = makeTask({
			metadataFields: [
				{ key: 'parent', value: 'k3m9x2qa' },
				{ key: 'tid', value: 'zzzz1111' },
			],
		});
		const line = serialize(task);
		const reparsed = parseSingleTaskLine(`- [ ] ${line}`, 'a.md', 'a', 1);
		expect(reparsed?.parentTid).toBe('k3m9x2qa');
		expect(reparsed?.tid).toBe('zzzz1111');
	});
});

describe('serializer metadata 与 guid 归一（历史缺陷回归）', () => {
	it('任务已有其它元数据时新增 feishuGuid 不再丢失', () => {
		const task = makeTask({ metadataFields: [{ key: 'foo', value: 'bar' }] });
		const line = serialize(task, { feishuGuid: 'g-123' });
		expect(line).toContain('%%[foo:: bar]%%');
		expect(line).toContain('%%[guid:: g-123]%%');
	});

	it('已有 guid 时清除 feishuGuid 能真正删掉', () => {
		const task = makeTask({
			metadataFields: [
				{ key: 'guid', value: 'old-guid' },
				{ key: 'foo', value: 'bar' },
			],
			feishuGuid: 'old-guid',
		});
		const line = serialize(task, { feishuGuid: null });
		expect(line).not.toContain('guid::');
		expect(line).toContain('%%[foo:: bar]%%');
	});

	it('未提及 guid 时沿用任务自身的 feishuGuid（同步历史数据兼容）', () => {
		const task = makeTask({ feishuGuid: 'legacy-guid' });
		const line = serialize(task);
		expect(line).toContain('%%[guid:: legacy-guid]%%');
	});

	it('替换已有 guid 时保持单条', () => {
		const task = makeTask({ metadataFields: [{ key: 'guid', value: 'old' }] });
		const line = serialize(task, { feishuGuid: 'new' });
		expect(line.match(/guid::/g)).toHaveLength(1);
		expect(line).toContain('%%[guid:: new]%%');
	});

	it('metadataFields: null 清空整组元数据', () => {
		const task = makeTask({ metadataFields: [{ key: 'foo', value: 'bar' }] });
		const line = serialize(task, { metadataFields: null });
		expect(line).not.toContain('%%[');
	});
});

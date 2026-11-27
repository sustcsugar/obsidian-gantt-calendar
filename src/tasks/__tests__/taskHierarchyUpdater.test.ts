import type { App } from 'obsidian';
import type { GCTask } from '../../types';
import { updateTaskProperties } from '../taskUpdater';
import {
	HierarchyWriteError,
	assignParent,
	clearParent,
	collectKnownTids,
	ensureTaskTid,
	isHierarchyEligible,
	notifyHierarchyError,
	wouldCreateCycle,
} from '../taskHierarchyUpdater';

jest.mock('../taskUpdater', () => ({
	updateTaskProperties: jest.fn().mockResolvedValue(undefined),
}));

const mockedUpdate = updateTaskProperties as jest.MockedFunction<typeof updateTaskProperties>;
const fakeApp = {} as App;
const FORMATS = ['tasks', 'dataview'];

function makeTask(overrides: Partial<GCTask> = {}): GCTask {
	return {
		filePath: 'notes/a.md',
		fileName: 'a',
		lineNumber: 1,
		content: '- [ ] 任务',
		description: '任务',
		completed: false,
		priority: 'normal',
		...overrides,
	};
}

beforeEach(() => {
	mockedUpdate.mockClear();
});

describe('isHierarchyEligible', () => {
	it('有路径与行号的任务可参与层级', () => {
		expect(isHierarchyEligible(makeTask())).toBe(true);
	});

	it('远程任务（lineNumber 0）与空路径被排除', () => {
		expect(isHierarchyEligible(makeTask({ lineNumber: 0 }))).toBe(false);
		expect(isHierarchyEligible(makeTask({ filePath: '' }))).toBe(false);
	});
});

describe('collectKnownTids', () => {
	it('收集已有 tid 并忽略缺失项', () => {
		const tids = collectKnownTids([makeTask({ tid: 'aaaa1111' }), makeTask(), makeTask({ tid: 'bbbb2222' })]);
		expect([...tids].sort()).toEqual(['aaaa1111', 'bbbb2222']);
	});
});

describe('wouldCreateCycle', () => {
	const parent = makeTask({ tid: 'pppp1111' });
	const child = makeTask({ tid: 'cccc2222', parentTid: 'pppp1111' });
	const grandchild = makeTask({ tid: 'gggg3333', parentTid: 'cccc2222' });

	it('普通挂载不成环', () => {
		expect(wouldCreateCycle([parent, child], 'cccc2222', 'pppp1111')).toBe(false);
	});

	it('挂到自己身上成环', () => {
		expect(wouldCreateCycle([parent], 'pppp1111', 'pppp1111')).toBe(true);
	});

	it('挂到自己的孙任务下成环', () => {
		expect(wouldCreateCycle([parent, child, grandchild], 'pppp1111', 'gggg3333')).toBe(true);
	});

	it('子任务还没有 tid 时不可能成环', () => {
		expect(wouldCreateCycle([parent], undefined, 'pppp1111')).toBe(false);
	});

	it('已有数据中带环时不会死循环', () => {
		const a = makeTask({ tid: 'aaaa0001', parentTid: 'bbbb0002' });
		const b = makeTask({ tid: 'bbbb0002', parentTid: 'aaaa0001' });
		expect(wouldCreateCycle([a, b], 'cccc0003', 'aaaa0001')).toBe(false);
	});
});

describe('ensureTaskTid', () => {
	it('已有 tid 时原样返回且不写文件', async () => {
		const task = makeTask({ metadataFields: [{ key: 'tid', value: 'exist111' }] });
		await expect(ensureTaskTid(fakeApp, task, FORMATS)).resolves.toBe('exist111');
		expect(mockedUpdate).not.toHaveBeenCalled();
	});

	it('无 tid 时生成并写回，保留其它元数据', async () => {
		const task = makeTask({ metadataFields: [{ key: 'foo', value: 'bar' }] });
		const tid = await ensureTaskTid(fakeApp, task, FORMATS);

		expect(tid).toMatch(/^[a-z0-9]{8}$/);
		expect(mockedUpdate).toHaveBeenCalledTimes(1);
		const [, writtenTask, updates] = mockedUpdate.mock.calls[0];
		expect(writtenTask).toBe(task);
		expect(updates.metadataFields).toEqual([
			{ key: 'foo', value: 'bar' },
			{ key: 'tid', value: tid },
		]);
	});

	it('写回失败转换为 write-failed', async () => {
		mockedUpdate.mockRejectedValueOnce(new Error('locked'));
		await expect(ensureTaskTid(fakeApp, makeTask(), FORMATS)).rejects.toMatchObject({ code: 'write-failed' });
	});
});

describe('assignParent', () => {
	const parent = makeTask({ lineNumber: 5, metadataFields: [{ key: 'tid', value: 'pppp1111' }] });
	const child = makeTask({ lineNumber: 6 });

	it('写入子任务 parent 并复用父任务 tid', async () => {
		const result = await assignParent(fakeApp, child, parent, [parent, child], FORMATS);

		expect(result).toMatchObject({ tid: 'pppp1111', changed: true });
		expect(result.metadataFields).toEqual([{ key: 'parent', value: 'pppp1111' }]);
		expect(mockedUpdate).toHaveBeenCalledTimes(1);
		const [, , updates] = mockedUpdate.mock.calls[0];
		expect(updates.metadataFields).toEqual([{ key: 'parent', value: 'pppp1111' }]);
	});

	it('父任务缺少 tid 时先懒写入 tid 再写 parent', async () => {
		const bareParent = makeTask({ lineNumber: 9 });
		const result = await assignParent(fakeApp, child, bareParent, [bareParent, child], FORMATS);

		expect(result.tid).toMatch(/^[a-z0-9]{8}$/);
		expect(mockedUpdate).toHaveBeenCalledTimes(2);
		expect(mockedUpdate.mock.calls[0][2].metadataFields).toEqual([{ key: 'tid', value: result.tid }]);
		expect(mockedUpdate.mock.calls[1][2].metadataFields).toEqual([{ key: 'parent', value: result.tid }]);
	});

	it('关系已存在时幂等，不重复写文件', async () => {
		const existingChild = makeTask({ lineNumber: 6, metadataFields: [{ key: 'parent', value: 'pppp1111' }] });
		const result = await assignParent(fakeApp, existingChild, parent, [parent, existingChild], FORMATS);
		expect(result.changed).toBe(false);
		expect(mockedUpdate).not.toHaveBeenCalled();
	});

	it('拒绝自挂', async () => {
		await expect(assignParent(fakeApp, parent, parent, [parent], FORMATS)).rejects.toMatchObject({ code: 'self' });
	});

	it('拒绝重复任务作为父', async () => {
		const recurring = makeTask({ lineNumber: 7, repeat: 'every day' });
		await expect(assignParent(fakeApp, child, recurring, [recurring, child], FORMATS))
			.rejects.toMatchObject({ code: 'repeat-parent' });
	});

	it('拒绝远程任务', async () => {
		const remote = makeTask({ lineNumber: 0 });
		await expect(assignParent(fakeApp, child, remote, [remote, child], FORMATS))
			.rejects.toMatchObject({ code: 'ineligible' });
	});

	it('拒绝成环', async () => {
		const grandparent = makeTask({ lineNumber: 1, metadataFields: [{ key: 'tid', value: 'gggg1111' }] });
		const mid = makeTask({ lineNumber: 2, metadataFields: [{ key: 'tid', value: 'mmmm2222' }, { key: 'parent', value: 'gggg1111' }] });
		await expect(assignParent(fakeApp, grandparent, mid, [grandparent, mid], FORMATS))
			.rejects.toMatchObject({ code: 'cycle' });
		expect(mockedUpdate).not.toHaveBeenCalled();
	});
});

describe('clearParent', () => {
	it('删除 parent 字段并保留 tid', async () => {
		const child = makeTask({
			metadataFields: [
				{ key: 'tid', value: 'cccc1111' },
				{ key: 'parent', value: 'pppp1111' },
				{ key: 'foo', value: 'bar' },
			],
		});
		const result = await clearParent(fakeApp, child, FORMATS);

		expect(result.changed).toBe(true);
		expect(mockedUpdate.mock.calls[0][2].metadataFields).toEqual([
			{ key: 'tid', value: 'cccc1111' },
			{ key: 'foo', value: 'bar' },
		]);
	});

	it('没有父关系时不写文件', async () => {
		const result = await clearParent(fakeApp, makeTask(), FORMATS);
		expect(result.changed).toBe(false);
		expect(mockedUpdate).not.toHaveBeenCalled();
	});
});

describe('HierarchyWriteError', () => {
	it('携带错误码与名称', () => {
		const error = new HierarchyWriteError('cycle', 'detail');
		expect(error.code).toBe('cycle');
		expect(error.name).toBe('HierarchyWriteError');
		expect(error.message).toBe('detail');
	});

	it('notifyHierarchyError 不抛异常', () => {
		expect(() => notifyHierarchyError(new HierarchyWriteError('self'))).not.toThrow();
	});
});

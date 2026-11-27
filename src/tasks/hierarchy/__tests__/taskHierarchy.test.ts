import type { GCTask } from '../../../types';
import {
	buildTaskHierarchy,
	getAncestorChain,
	getChildNodes,
	getHierarchyNode,
	getParentNode,
	getTaskKey,
	type TaskHierarchyIndex,
} from '../taskHierarchy';

function makeTask(
	filePath: string,
	lineNumber: number,
	overrides: Partial<GCTask> = {}
): GCTask {
	return {
		filePath,
		fileName: filePath.replace(/\.md$/, ''),
		lineNumber,
		content: `- [ ] 任务 ${lineNumber}`,
		description: `任务 ${lineNumber}`,
		completed: false,
		priority: 'normal',
		...overrides,
	};
}

/** 用 metadataFields 表达关系，模拟真实解析结果 */
function withRelation(tid?: string, parent?: string): Partial<GCTask> {
	const fields = [];
	if (tid) fields.push({ key: 'tid', value: tid });
	if (parent) fields.push({ key: 'parent', value: parent });
	return {
		tid,
		parentTid: parent,
		metadataFields: fields.length > 0 ? fields : undefined,
	};
}

describe('buildTaskHierarchy', () => {
	it('无任何关系时全部是根', () => {
		const tasks = [makeTask('a.md', 1), makeTask('a.md', 2)];
		const index = buildTaskHierarchy(tasks);
		expect(index.roots).toHaveLength(2);
		expect(index.invalid).toBe(0);
	});

	it('单层父子：父有 2 个子节点', () => {
		const parent = makeTask('a.md', 1, withRelation('pppp1111'));
		const child1 = makeTask('a.md', 2, withRelation(undefined, 'pppp1111'));
		const child2 = makeTask('a.md', 3, withRelation(undefined, 'pppp1111'));

		const index = buildTaskHierarchy([parent, child1, child2]);
		expect(index.roots).toHaveLength(1);
		expect(index.roots[0].task).toBe(parent);
		expect(index.roots[0].children.map((c) => c.task)).toEqual([child1, child2]);
		expect(index.roots[0].hasChildren).toBe(true);
		expect(getChildNodes(index, parent)).toHaveLength(2);
	});

	it('三层嵌套：深度正确', () => {
		const root = makeTask('a.md', 1, withRelation('r0000001'));
		const mid = makeTask('a.md', 2, withRelation('m0000002', 'r0000001'));
		const leaf = makeTask('a.md', 3, withRelation(undefined, 'm0000002'));

		const index = buildTaskHierarchy([root, mid, leaf]);
		expect(index.roots).toHaveLength(1);
		expect(index.roots[0].depth).toBe(0);
		expect(index.roots[0].children[0].depth).toBe(1);
		expect(index.roots[0].children[0].children[0].depth).toBe(2);
		expect(getAncestorChain(index, index.byTid.get('m0000002') as never).map((n) => n.tid)).toEqual([
			'm0000002',
			'r0000001',
		]);
	});

	it('跨文件父子也能连上', () => {
		const parent = makeTask('project.md', 1, withRelation('pppp1111'));
		const child = makeTask('daily/2026-11-27.md', 5, withRelation(undefined, 'pppp1111'));

		const index = buildTaskHierarchy([parent, child]);
		expect(index.roots).toHaveLength(1);
		expect(index.roots[0].children[0].task).toBe(child);
		expect(getParentNode(index, child)?.task).toBe(parent);
	});

	it('断链：父不存在时自身成为根并标记 orphan', () => {
		const orphan = makeTask('a.md', 1, withRelation(undefined, 'missing1'));
		const index = buildTaskHierarchy([orphan]);

		expect(index.roots).toHaveLength(1);
		expect(index.roots[0].orphan).toBe(true);
		expect(index.invalid).toBe(1);
	});

	it('环：A→B→A 被断开，不死循环且标记 cyclic', () => {
		const a = makeTask('a.md', 1, withRelation('aaaa0001', 'bbbb0002'));
		const b = makeTask('a.md', 2, withRelation('bbbb0002', 'aaaa0001'));

		const index = buildTaskHierarchy([a, b]);
		expect(index.roots.length).toBeGreaterThanOrEqual(1);
		expect(index.invalid).toBeGreaterThanOrEqual(1);
		const cyclicNodes = [index.byKey.get(getTaskKey(a)), index.byKey.get(getTaskKey(b))];
		expect(cyclicNodes.some((n) => n?.cyclic)).toBe(true);
	});

	it('自指：视为环，成为根', () => {
		const self = makeTask('a.md', 1, withRelation('ssss0001', 'ssss0001'));
		const index = buildTaskHierarchy([self]);
		expect(index.roots).toHaveLength(1);
		expect(index.roots[0].cyclic).toBe(true);
	});

	it('重复 tid：先到者保留，后来者标记 duplicateTid 并成为根', () => {
		const first = makeTask('a.md', 1, withRelation('dupp0001'));
		const second = makeTask('a.md', 2, withRelation('dupp0001'));

		const index = buildTaskHierarchy([first, second]);
		expect(index.byTid.get('dupp0001')?.task).toBe(first);
		const secondNode = index.byKey.get(getTaskKey(second));
		expect(secondNode?.duplicateTid).toBe(true);
		expect(secondNode?.tid).toBeNull();
		expect(index.roots.map((n) => n.task)).toContain(second);
	});

	it('重复任务不能当父：子任务降级为根', () => {
		const parent = makeTask('a.md', 1, { ...withRelation('rrrr0001'), repeat: 'every day' });
		const child = makeTask('a.md', 2, withRelation(undefined, 'rrrr0001'));

		const index = buildTaskHierarchy([parent, child]);
		const childNode = index.byKey.get(getTaskKey(child));
		expect(childNode?.invalidParent).toBe(true);
		expect(index.roots.map((n) => n.task)).toContain(child);
		expect(index.roots.map((n) => n.task)).toContain(parent);
	});

	it('远程任务（lineNumber 0）不参与索引', () => {
		const remote = makeTask('api:feishu', 0, withRelation('rem00001'));
		const index = buildTaskHierarchy([remote]);
		expect(index.byKey.size).toBe(0);
	});

	it('缺少派生字段时回落到 metadataFields', () => {
		const parent: GCTask = {
			...makeTask('a.md', 1),
			metadataFields: [{ key: 'tid', value: 'meta0001' }],
			tid: undefined,
		};
		const child: GCTask = {
			...makeTask('a.md', 2),
			metadataFields: [{ key: 'parent', value: 'meta0001' }],
			parentTid: undefined,
		};

		const index = buildTaskHierarchy([parent, child]);
		expect(index.byTid.get('meta0001')?.task).toBe(parent);
		expect(getParentNode(index, child)?.task).toBe(parent);
	});

	it('4000 层深链不爆栈', () => {
		const tasks: GCTask[] = [];
		for (let i = 0; i < 4000; i++) {
			const tid = `t${String(i).padStart(7, '0')}`;
			const parent = i === 0 ? undefined : `t${String(i - 1).padStart(7, '0')}`;
			tasks.push(makeTask('a.md', i + 1, withRelation(tid, parent)));
		}
		const index = buildTaskHierarchy(tasks);
		expect(index.roots).toHaveLength(1);
		expect(index.invalid).toBe(0);

		let cursor = index.roots[0];
		let depth = 0;
		while (cursor.children.length > 0) {
			cursor = cursor.children[0];
			depth += 1;
		}
		expect(depth).toBe(3999);
	});

	it('重复行号（同一 key）只保留第一个', () => {
		const first = makeTask('a.md', 1, withRelation('first001'));
		const second = makeTask('a.md', 1, withRelation('second01'));
		const index: TaskHierarchyIndex = buildTaskHierarchy([first, second]);
		expect(index.byKey.size).toBe(1);
		expect(getHierarchyNode(index, first)?.task).toBe(first);
		expect(getHierarchyNode(index, second)?.task).toBe(first);
	});
});
